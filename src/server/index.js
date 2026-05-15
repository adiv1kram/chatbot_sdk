import { runChatTurn } from '../core/chat.js';
import { classifyIntent, isActionable } from '../core/intent.js';
import { generateLeadBrief } from '../core/brief.js';
import { validateChatRequest, isValidationError, isProfileConfigured } from '../core/validators.js';
import { loadProfile } from '../core/profile-loader.js';
import { loadSecrets, resolveApiKey, resolveProvider } from '../core/secrets.js';
import { createRateLimiter } from '../core/rate-limit.js';

/**
 * @typedef {Object} ChatHandlerConfig
 * @property {import('../core/types.js').StorageAdapter} [storage] - Where the profile JSON lives. Required unless an inline `profile` is passed for tests/CLI.
 * @property {import('../core/types.js').StorageAdapter} [secretsStorage] - Optional secrets store (LLM key + default provider). Resolution precedence: secrets.json > env var > inline config.
 * @property {import('../core/types.js').Profile} [profile] - Inline profile (test / CLI path). Bypasses storage when provided.
 * @property {import('../core/providers.js').ProviderName} [provider] - Fallback LLM provider when secretsStorage doesn't specify one.
 * @property {string} [apiKey] - Fallback API key when no secretsStorage / env var is configured.
 * @property {{ chat?: string, heavy?: string }} [models] - Optional model overrides.
 * @property {import('../core/rate-limit.js').RateLimitConfig | false} [rateLimit] - Defaults applied if undefined. Pass `false` to disable rate limiting entirely.
 * @property {(lead: import('../core/types.js').Lead) => Promise<void>|void} [onLead] - Fires when intent is opportunity / needs_followup.
 * @property {(chat: import('../core/types.js').ChatEnd) => Promise<void>|void} [onChatEnd] - Fires after every chat ends, regardless of classification.
 */

const JSON_HEADERS = { 'content-type': 'application/json' };

/**
 * Create a Web Standards-compatible chat handler.
 *
 * Methods:
 * - GET → status probe. Returns `{ configured: boolean }`. Used by the widget
 *         to decide whether to render at all.
 * - POST + body.action: 'message' (default) → streams a chat response.
 * - POST + body.action: 'end' → classifies intent, generates brief if
 *         actionable, fires callbacks.
 *
 * @param {ChatHandlerConfig} config
 * @returns {(request: Request) => Promise<Response>}
 */
export function createChatHandler(config) {
  if (!config?.storage && !config?.profile) {
    throw new Error('createChatHandler: pass either config.storage or config.profile');
  }
  if (config?.secretsStorage && config.secretsStorage.supportsSecrets === false) {
    throw new Error(
      'createChatHandler: the storage adapter passed as `secretsStorage` does not support secrets. ' +
        'Use createFilesystemStorage or createS3Storage; the github adapter is rejected.'
    );
  }

  /** @returns {Promise<import('../core/types.js').Profile>} */
  async function resolveProfileFn() {
    if (config.profile) return config.profile;
    return loadProfile(config.storage);
  }

  async function resolveLlm() {
    let secrets = null;
    if (config.secretsStorage) {
      try {
        secrets = await loadSecrets(config.secretsStorage);
      } catch {
        secrets = null;
      }
    }
    const provider = resolveProvider({ secrets, fallback: config.provider });
    const apiKey = resolveApiKey({ secrets, provider, inlineFallback: config.apiKey });
    return { provider, apiKey };
  }

  const limiter = config.rateLimit === false ? null : createRateLimiter(config.rateLimit || {});

  return async (request) => {
    if (request.method === 'GET') {
      try {
        const profile = await resolveProfileFn();
        const { apiKey } = await resolveLlm();
        return new Response(
          JSON.stringify({
            configured: isProfileConfigured(profile) && !!apiKey,
            profileReady: isProfileConfigured(profile),
            keyReady: !!apiKey,
          }),
          { status: 200, headers: { ...JSON_HEADERS, 'cache-control': 'no-store' } }
        );
      } catch (err) {
        return jsonError(500, 'status_failed', err);
      }
    }
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405,
        headers: { ...JSON_HEADERS, allow: 'GET, POST' },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, 'invalid_json');
    }

    let parsed;
    try {
      parsed = validateChatRequest(body);
    } catch (err) {
      if (isValidationError(err)) {
        return new Response(
          JSON.stringify({ error: 'invalid_request', issues: err.issues?.map((i) => i.message) }),
          { status: 400, headers: JSON_HEADERS }
        );
      }
      throw err;
    }

    let profile;
    try {
      profile = await resolveProfileFn();
    } catch (err) {
      return jsonError(500, 'profile_load_failed', err);
    }
    if (!isProfileConfigured(profile)) {
      return new Response(
        JSON.stringify({ error: 'not_configured', reason: 'The chatbot profile has not been set up yet.' }),
        { status: 503, headers: JSON_HEADERS }
      );
    }

    // Final-lead capture from the widget's limit-reached form. No LLM call —
    // just fire onLead with the visitor info + transcript so the professional
    // can follow up even though the chat budget is exhausted.
    if (parsed.action === 'final_lead') {
      return handleFinalLead(config, parsed);
    }

    const { provider, apiKey } = await resolveLlm();
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: 'no_api_key',
          reason:
            'No LLM API key is configured. Set one in the admin Connections tab, or set the appropriate env var.',
        }),
        { status: 503, headers: JSON_HEADERS }
      );
    }

    // Rate-limit check (skip for 'end' since it's a single classification call,
    // and we want the lead to still go out even if message budget was hit).
    const ip = extractClientIp(request);
    const limit = limiter
      ? limiter.check({ sessionId: parsed.sessionId, ip })
      : { allowed: true, nearLimit: false, hitLimit: null, retryAfter: 0, remaining: { session: Infinity, ip: Infinity, daily: Infinity } };

    if (parsed.action === 'message' && !limit.allowed) {
      return new Response(
        JSON.stringify({
          error: 'limit_reached',
          hitLimit: limit.hitLimit,
          retryAfter: limit.retryAfter,
          contact: {
            hint: profile.name
              ? `Share your email and ${profile.name} will follow up directly.`
              : 'Share your email and the professional will follow up directly.',
          },
        }),
        {
          status: 429,
          headers: {
            ...JSON_HEADERS,
            'retry-after': String(limit.retryAfter),
            'x-pac-hit-limit': limit.hitLimit || '',
          },
        }
      );
    }

    if (parsed.action === 'end') {
      return handleEnd(config, profile, { provider, apiKey }, parsed.messages);
    }

    const response = await handleMessage(config, profile, { provider, apiKey }, parsed.messages, {
      nearLimit: limit.nearLimit,
    });
    // Commit the count only after a successful response (failed/limit-rejected
    // turns don't consume budget). Fire-and-forget: the count is updated
    // before the response body finishes streaming.
    if (limiter && response.ok) {
      limiter.commit({ sessionId: parsed.sessionId, ip });
    }
    return response;
  };
}

/**
 * Pull the visitor's IP from common reverse-proxy headers, falling back to
 * 'unknown' so multiple anonymous clients share the same bucket (safer than
 * letting them bypass IP limits by stripping headers).
 * @param {Request} request
 */
function extractClientIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

async function handleFinalLead(config, parsed) {
  const visitor = parsed.visitor || {};
  if (!visitor.email && !visitor.name) {
    return new Response(
      JSON.stringify({ error: 'missing_visitor', reason: 'name and email are required.' }),
      { status: 400, headers: JSON_HEADERS }
    );
  }
  const transcript = parsed.messages;
  if (config.onLead) {
    await safeCall(config.onLead, {
      classification: 'needs_followup',
      confidence: 0.95,
      visitor: {
        name: visitor.name || '',
        email: visitor.email || '',
        company: visitor.company || '',
      },
      brief: {
        topic: 'Chat hit the rate limit; visitor explicitly requested a follow-up.',
        highlights: visitor.note ? [visitor.note] : [],
        nextStep: 'Reach out via email at your convenience.',
      },
      transcript,
    });
  }
  if (config.onChatEnd) {
    await safeCall(config.onChatEnd, {
      transcript,
      classification: 'needs_followup',
      confidence: 0.95,
    });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: JSON_HEADERS });
}

function handleMessage(config, profile, llm, messages, opts = {}) {
  try {
    const result = runChatTurn({
      profile,
      provider: llm.provider,
      apiKey: llm.apiKey,
      models: config.models,
      messages,
      nearLimitNudge: !!opts.nearLimit,
    });
    return result.toTextStreamResponse();
  } catch (err) {
    return jsonError(502, 'chat_failed', err);
  }
}

async function handleEnd(config, profile, llm, transcript) {
  try {
    const { classification, confidence } = await classifyIntent({
      profile,
      transcript,
      provider: llm.provider,
      apiKey: llm.apiKey,
      models: config.models,
    });

    let brief = null;
    if (isActionable(classification)) {
      brief = await generateLeadBrief({
        profile,
        transcript,
        classification,
        provider: llm.provider,
        apiKey: llm.apiKey,
        models: config.models,
      });
    }

    if (brief && config.onLead) {
      await safeCall(config.onLead, {
        classification,
        confidence,
        visitor: brief.visitor ?? {},
        brief: { topic: brief.topic, highlights: brief.highlights, nextStep: brief.nextStep },
        transcript,
      });
    }

    if (config.onChatEnd) {
      await safeCall(config.onChatEnd, { transcript, classification, confidence });
    }

    return new Response(
      JSON.stringify({ ok: true, classification, confidence, actionable: !!brief }),
      { status: 200, headers: JSON_HEADERS }
    );
  } catch (err) {
    return jsonError(502, 'end_failed', err);
  }
}

async function safeCall(fn, arg) {
  try {
    await fn(arg);
  } catch (err) {
    console.error('[personal-assistant-chatbot] callback threw:', err);
  }
}

function jsonError(status, code, cause) {
  const reason = cause instanceof Error ? cause.message : undefined;
  return new Response(JSON.stringify({ error: code, reason }), {
    status,
    headers: JSON_HEADERS,
  });
}
