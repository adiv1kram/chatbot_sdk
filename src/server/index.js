import { runChatTurn } from '../core/chat.js';
import { classifyIntent, isActionable } from '../core/intent.js';
import { generateLeadBrief } from '../core/brief.js';
import { hasContactHandle } from '../core/contact.js';
import { validateChatRequest, isValidationError, isProfileConfigured } from '../core/validators.js';
import { loadProfile } from '../core/profile-loader.js';
import { loadSecrets, resolveApiKey, resolveProvider } from '../core/secrets.js';
import { createRateLimiter } from '../core/rate-limit.js';
import {
  resolveNotifier,
  buildLeadEmail,
  recordDelivery,
  hasAlreadySent,
  markSent,
  hasDispatchedLead,
  markLeadDispatched,
} from '../notify/index.js';

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
 * @property {string | string[]} [allowedOrigins] - Origins allowed to call this endpoint cross-origin (for an embedded widget on another site). A single origin, an array, or `'*'` to echo any origin. Omit for same-origin-only.
 * @property {import('../notify/index.js').Notifier} [notifier] - Explicit notifier instance. Overrides the secrets-based resolution. Mainly for tests + dev.
 * @property {{ clientId?: string, clientSecret?: string }} [googleAuth] - Google OAuth client id + secret. Needed when the Gmail notifier is configured via secrets.json. Falls back to CHATBOT_GOOGLE_CLIENT_ID / _SECRET env vars.
 */

const JSON_HEADERS = { 'content-type': 'application/json' };

// ---------- Background tasks ----------
// The fire-when-actionable lead evaluation runs off the chat request path so it
// never adds latency to (or breaks) the streamed reply. We track the in-flight
// promises so tests can await them deterministically; in production they're
// fire-and-forget. NOTE: this relies on a long-lived process (the documented
// Docker/Node target) to finish the promise. On serverless/edge you'd hand the
// promise to the platform's waitUntil() instead.

/** @type {Set<Promise<void>>} */
const pendingBackground = new Set();

/**
 * Run a promise in the background, isolating any failure from the request path.
 * @param {Promise<unknown>} promise
 */
function runInBackground(promise) {
  const tracked = Promise.resolve(promise)
    .catch((err) => {
      console.error('[personal-assistant-chatbot] background lead evaluation failed:', err);
    })
    .finally(() => pendingBackground.delete(tracked));
  pendingBackground.add(tracked);
}

/** Test-only: await all in-flight background tasks. */
export async function _flushBackgroundForTests() {
  while (pendingBackground.size) {
    await Promise.all([...pendingBackground]);
  }
}

/**
 * Create a Web Standards-compatible chat handler.
 *
 * Methods:
 * - GET → status probe. Returns `{ configured: boolean }`. Used by the widget
 *         to decide whether to render at all.
 * - POST + body.action: 'message' (default) → streams a chat response. Once
 *         the visitor has shared a contact handle, it also kicks off a
 *         background lead evaluation (classify → brief → onLead + email) so the
 *         professional is notified without the visitor having to end the chat.
 * - POST + body.action: 'end' → classifies intent, generates brief if
 *         actionable, fires callbacks. Now a deduped backstop to the
 *         fire-when-actionable path above.
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
  const allowedOrigins = normalizeAllowedOrigins(config.allowedOrigins);

  async function resolveNotifierFromContext() {
    if (config.notifier) return config.notifier;
    if (!config.secretsStorage) return null;
    let secrets;
    try {
      secrets = await loadSecrets(config.secretsStorage);
    } catch {
      return null;
    }
    const clientId =
      config.googleAuth?.clientId ?? process.env.CHATBOT_GOOGLE_CLIENT_ID ?? undefined;
    const clientSecret =
      config.googleAuth?.clientSecret ?? process.env.CHATBOT_GOOGLE_CLIENT_SECRET ?? undefined;
    try {
      return resolveNotifier({ notify: secrets.notify, google: { clientId, clientSecret } });
    } catch (err) {
      console.error('[personal-assistant-chatbot] resolveNotifier failed:', err);
      return null;
    }
  }

  async function resolveRecipient() {
    if (!config.secretsStorage) return '';
    try {
      const secrets = await loadSecrets(config.secretsStorage);
      return secrets.notify?.to || '';
    } catch {
      return '';
    }
  }

  const handle = async (request) => {
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
        JSON.stringify({
          error: 'not_configured',
          reason: 'The chatbot profile has not been set up yet.',
        }),
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
      : {
          allowed: true,
          nearLimit: false,
          hitLimit: null,
          retryAfter: 0,
          remaining: { session: Infinity, ip: Infinity, daily: Infinity },
        };

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
      return handleEnd(config, profile, { provider, apiKey }, parsed.messages, parsed.sessionId, {
        resolveNotifier: resolveNotifierFromContext,
        resolveRecipient,
      });
    }

    const response = await handleMessage(config, profile, { provider, apiKey }, parsed.messages, {
      nearLimit: limit.nearLimit,
    });

    // Fire-when-actionable: once the visitor has shared a contact handle, run a
    // background lead evaluation (classify → brief → onLead + email). This is
    // what removes the dependency on the visitor clicking "End chat" — most
    // never do. The gate is a cheap regex, so casual sessions that never share
    // contact info cost nothing extra; the dispatch dedupe stops us re-running
    // once a lead has gone out. Runs off the response path: never delays or
    // breaks the streamed reply.
    if (
      parsed.sessionId &&
      hasContactHandle(parsed.messages) &&
      !hasDispatchedLead(parsed.sessionId)
    ) {
      runInBackground(
        evaluateAndNotify({
          config,
          profile,
          llm: { provider, apiKey },
          transcript: parsed.messages,
          sessionId: parsed.sessionId,
          notifyCtx: { resolveNotifier: resolveNotifierFromContext, resolveRecipient },
        })
      );
    }

    // Commit the count only after a successful response (failed/limit-rejected
    // turns don't consume budget). Fire-and-forget: the count is updated
    // before the response body finishes streaming.
    if (limiter && response.ok) {
      limiter.commit({ sessionId: parsed.sessionId, ip });
    }
    return response;
  };

  return async (request) => {
    const cors = corsHeadersFor(request, allowedOrigins);
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '86400',
        },
      });
    }
    const response = await handle(request);
    return applyCorsHeaders(response, cors);
  };
}

/**
 * Coerce the `allowedOrigins` config into a stable shape: `'*'`, a non-empty
 * array of exact origins, or `null` (CORS disabled — same-origin only).
 * @param {string | string[] | undefined} value
 * @returns {'*' | string[] | null}
 */
function normalizeAllowedOrigins(value) {
  if (!value) return null;
  if (value === '*') return '*';
  const list = (Array.isArray(value) ? value : [value])
    .map((o) => String(o).trim())
    .filter(Boolean);
  if (list.length === 0) return null;
  if (list.includes('*')) return '*';
  return list;
}

/**
 * Compute the CORS response headers for a request. Returns an empty object
 * when CORS is disabled, the request carries no Origin, or the origin is not
 * allowlisted — in all those cases no CORS headers are emitted.
 * @param {Request} request
 * @param {'*' | string[] | null} allowedOrigins
 * @returns {Record<string, string>}
 */
function corsHeadersFor(request, allowedOrigins) {
  if (!allowedOrigins) return {};
  const origin = request.headers.get('origin');
  if (!origin) return {};
  if (allowedOrigins === '*' || allowedOrigins.includes(origin)) {
    return { 'access-control-allow-origin': origin, vary: 'Origin' };
  }
  return {};
}

/**
 * Return a copy of `response` with the CORS headers merged in. Streaming
 * bodies are passed through untouched.
 * @param {Response} response
 * @param {Record<string, string>} cors
 */
function applyCorsHeaders(response, cors) {
  const keys = Object.keys(cors);
  if (keys.length === 0) return response;
  const headers = new Headers(response.headers);
  for (const k of keys) headers.set(k, cors[k]);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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

/**
 * Classify a transcript and, when it's an actionable lead, generate the brief,
 * fire `onLead`, and send the opportunity email.
 *
 * This is the single trigger shared by both paths that can detect a lead:
 *  - the fire-when-actionable gate, which calls it mid-conversation as soon as
 *    the visitor shares a contact handle (so notification doesn't depend on the
 *    visitor ever clicking "End chat"); and
 *  - the End button, which calls it as a backstop.
 *
 * Side-effects fire at most once per session, guarded by the lead-dispatch
 * dedupe — the mid-chat gate may call this on several turns and End may call it
 * again, but the professional gets a single onLead and a single email attempt.
 *
 * @returns {Promise<{ classification: string, confidence: number, actionable: boolean, emailed: boolean }>}
 */
async function evaluateAndNotify({ config, profile, llm, transcript, sessionId, notifyCtx }) {
  const { classification, confidence } = await classifyIntent({
    profile,
    transcript,
    provider: llm.provider,
    apiKey: llm.apiKey,
    models: config.models,
  });

  const actionable = isActionable(classification);
  const alreadyDispatched = sessionId ? hasDispatchedLead(sessionId) : false;

  // Fire the email notifier on both `opportunity` and `needs_followup`.
  // (Original locked decision was opportunity-only; widened on 2026-05-20
  // after a real-world test classified a clearly-actionable lead — visitor
  // shared name/company/email + asked to talk — as needs_followup because
  // they hadn't pitched a concrete role. Treat any actionable lead as
  // worth an email.) Failure-isolated: any throw is logged but never
  // bubbles up.
  let emailed = false;
  if (actionable && !alreadyDispatched) {
    const brief = await generateLeadBrief({
      profile,
      transcript,
      classification,
      provider: llm.provider,
      apiKey: llm.apiKey,
      models: config.models,
    });
    if (brief) {
      const lead = {
        classification,
        confidence,
        visitor: brief.visitor ?? {},
        brief: { topic: brief.topic, highlights: brief.highlights, nextStep: brief.nextStep },
        transcript,
      };
      if (config.onLead) {
        await safeCall(config.onLead, lead);
      }
      emailed = await sendOpportunityEmail({
        profile,
        lead,
        sessionId,
        classification,
        siteUrl: notifyCtx?.siteUrl,
        resolveNotifier: notifyCtx?.resolveNotifier,
        resolveRecipient: notifyCtx?.resolveRecipient,
      });
      // Mark dispatched even if the email failed or no notifier/recipient was
      // configured: onLead already fired and we don't want to re-fire it on
      // subsequent turns. The delivery log records any send failure.
      if (sessionId) markLeadDispatched(sessionId);
    }
  }

  return { classification, confidence, actionable, emailed };
}

async function handleEnd(config, profile, llm, transcript, sessionId, notifyCtx) {
  try {
    const { classification, confidence, actionable, emailed } = await evaluateAndNotify({
      config,
      profile,
      llm,
      transcript,
      sessionId,
      notifyCtx,
    });

    if (config.onChatEnd) {
      await safeCall(config.onChatEnd, { transcript, classification, confidence });
    }

    return new Response(
      JSON.stringify({ ok: true, classification, confidence, actionable, emailed }),
      { status: 200, headers: JSON_HEADERS }
    );
  } catch (err) {
    return jsonError(502, 'end_failed', err);
  }
}

/**
 * Try to send the opportunity email. Returns true if a send was attempted
 * and succeeded; false in every other case (no config, dedupe hit, error).
 * Never throws — all failures are caught and recorded in the delivery log.
 *
 * @param {Object} args
 * @param {import('../core/types.js').Profile} args.profile
 * @param {import('../core/types.js').Lead} args.lead
 * @param {string} args.sessionId
 * @param {string} [args.siteUrl]
 * @param {() => Promise<import('../notify/index.js').Notifier | null>} [args.resolveNotifier]
 * @param {() => Promise<string>} [args.resolveRecipient]
 */
async function sendOpportunityEmail({
  profile,
  lead,
  sessionId,
  classification,
  siteUrl,
  resolveNotifier,
  resolveRecipient,
}) {
  if (!resolveNotifier) return false;
  if (sessionId && hasAlreadySent(sessionId)) return false;
  let notifier = null;
  try {
    notifier = await resolveNotifier();
  } catch {
    notifier = null;
  }
  if (!notifier) return false;
  const to = resolveRecipient ? (await resolveRecipient().catch(() => '')) || '' : '';
  if (!to) {
    recordDelivery({
      at: Date.now(),
      kind: notifier.kind || 'unknown',
      ok: false,
      to: '',
      subject: '',
      error: 'No recipient configured (set notify.to in admin → Notifications).',
      sessionId,
    });
    return false;
  }
  const { subject, html, text } = buildLeadEmail({
    professionalName: profile?.name || '',
    lead,
    transcript: lead.transcript,
    siteUrl,
    classification,
  });
  const at = Date.now();
  try {
    const result = await notifier.send({ to, subject, html, text });
    recordDelivery({
      at,
      kind: notifier.kind,
      ok: true,
      to,
      subject,
      messageId: result.messageId || undefined,
      sessionId,
    });
    if (sessionId) markSent(sessionId);
    return true;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error('[personal-assistant-chatbot] notifier send failed:', reason);
    recordDelivery({
      at,
      kind: notifier.kind || 'unknown',
      ok: false,
      to,
      subject,
      error: reason,
      sessionId,
    });
    return false;
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
