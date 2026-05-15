import { generateText } from 'ai';
import { loadProfile, saveProfile } from '../core/profile-loader.js';
import {
  loadSecrets,
  saveSecrets,
  maskSecrets,
  mergeSecretsPatch,
  resolveApiKey,
  resolveProvider,
  PROVIDERS,
} from '../core/secrets.js';
import { getModel, resolveModel } from '../core/providers.js';
import { extractResumeText, structureProfileFromResume } from '../utils/resume.js';
import { validateProfile, isValidationError } from '../core/validators.js';
import { renderAdminShell, getAdminUiBundle, ADMIN_CSS } from './static.js';
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  fetchUserInfo,
  generatePkcePair,
  generateRandomToken,
  parseAllowedEmails,
  hmacSha256,
  constantTimeEqual,
} from './auth-google.js';

/**
 * @typedef {Object} AdminLlmConfig
 * @property {import('../core/providers.js').ProviderName} provider
 * @property {string} apiKey
 * @property {{chat?: string, heavy?: string}} [models]
 *
 * @typedef {Object} AdminGoogleAuthConfig
 * @property {string} clientId - OAuth 2.0 client ID from Google Cloud Console.
 * @property {string} clientSecret - OAuth 2.0 client secret. Also used as the HMAC key for session cookies.
 * @property {string | string[]} allowedEmails - Allowlist of Google account emails permitted to sign in. Comma/space-separated string or array.
 *
 * @typedef {Object} AdminHandlerConfig
 * @property {import('../core/types.js').StorageAdapter} storage
 * @property {import('../core/types.js').StorageAdapter} [secretsStorage] - Where LLM API keys edited via the Connections UI are persisted. Must declare `supportsSecrets: true` — the github adapter is rejected. If omitted, the Connections tab tells the professional to set env vars.
 * @property {AdminGoogleAuthConfig} [auth] - Google OAuth config. Each field can also be omitted here and read from env (CHATBOT_GOOGLE_CLIENT_ID / _SECRET / CHATBOT_ALLOWED_EMAILS).
 * @property {AdminLlmConfig} [llm] - Used by /api/parse-resume when no key is configured via secretsStorage; optional.
 * @property {string} [cookieName] - Session cookie name. Default: "pac_admin".
 * @property {string} [pendingCookieName] - In-flight-OAuth cookie name. Default: "pac_oauth_pending".
 * @property {number} [cookieMaxAgeSeconds] - Session lifetime. Default: 604800 (7 days).
 * @property {boolean} [secureCookie] - Force Secure cookie attribute. Default: auto (true unless NODE_ENV=development).
 */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const SESSION_TAG = 'pac-admin-session-v2';
const PENDING_MAX_AGE = 60 * 10; // 10 minutes — OAuth roundtrip is fast

/**
 * Create the admin handler. Mount it at any path. Routes are matched by
 * path suffix so the mount point is irrelevant.
 *
 * @param {AdminHandlerConfig} config
 * @returns {(request: Request) => Promise<Response>}
 */
export function createAdminHandler(config) {
  if (!config?.storage) throw new Error('createAdminHandler: config.storage is required');
  if (config.secretsStorage && config.secretsStorage.supportsSecrets === false) {
    throw new Error(
      'createAdminHandler: the storage adapter passed as `secretsStorage` does not support secrets ' +
        '(typically because it commits to a git repo). Use createFilesystemStorage or createS3Storage instead, ' +
        'or omit secretsStorage and rely on env vars.'
    );
  }

  const cookieName = config?.cookieName ?? 'pac_admin';
  const pendingCookieName = config?.pendingCookieName ?? 'pac_oauth_pending';
  const cookieMaxAge = config?.cookieMaxAgeSeconds ?? 60 * 60 * 24 * 7;
  const secureCookie =
    typeof config?.secureCookie === 'boolean'
      ? config.secureCookie
      : process.env.NODE_ENV !== 'development';

  return async (request) => {
    const authConfig = resolveAuthConfig(config?.auth);
    if (!authConfig.ok) return serveSetupPage(authConfig.missing);

    const url = new URL(request.url);
    const route = matchRoute(url.pathname);

    if (route.kind === 'static') {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      return serveStatic(route.asset);
    }

    if (route.kind === 'api') {
      return handleApi(route.path, request, {
        storage: config.storage,
        secretsStorage: config.secretsStorage,
        clientId: authConfig.clientId,
        clientSecret: authConfig.clientSecret,
        allowedEmails: authConfig.allowedEmails,
        cookieName,
        pendingCookieName,
        cookieMaxAge,
        secureCookie,
        llm: config.llm,
      });
    }

    if (request.method !== 'GET') return methodNotAllowed('GET');
    return new Response(renderAdminShell(url.pathname), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  };
}

/**
 * @param {AdminGoogleAuthConfig | undefined} auth
 */
function resolveAuthConfig(auth) {
  const clientId = auth?.clientId ?? process.env.CHATBOT_GOOGLE_CLIENT_ID ?? '';
  const clientSecret = auth?.clientSecret ?? process.env.CHATBOT_GOOGLE_CLIENT_SECRET ?? '';
  const allowedRaw = auth?.allowedEmails ?? process.env.CHATBOT_ALLOWED_EMAILS ?? '';
  const allowedEmails = Array.isArray(allowedRaw)
    ? new Set(allowedRaw.map((e) => String(e).trim().toLowerCase()).filter(Boolean))
    : parseAllowedEmails(allowedRaw);

  const missing = [];
  if (!clientId || typeof clientId !== 'string') missing.push('CHATBOT_GOOGLE_CLIENT_ID');
  if (!clientSecret || typeof clientSecret !== 'string') missing.push('CHATBOT_GOOGLE_CLIENT_SECRET');
  if (allowedEmails.size === 0) missing.push('CHATBOT_ALLOWED_EMAILS');

  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, clientId, clientSecret, allowedEmails };
}

/**
 * @param {string} pathname
 */
function matchRoute(pathname) {
  const p = pathname.replace(/\/+$/, '');
  if (p.endsWith('/static/ui.js')) return /** @type {const} */ ({ kind: 'static', asset: 'ui.js' });
  if (p.endsWith('/static/ui.css')) return /** @type {const} */ ({ kind: 'static', asset: 'ui.css' });
  const apiIdx = p.lastIndexOf('/api/');
  if (apiIdx !== -1) return /** @type {const} */ ({ kind: 'api', path: p.slice(apiIdx + 4) });
  return /** @type {const} */ ({ kind: 'shell' });
}

/**
 * @param {'ui.js'|'ui.css'} asset
 */
async function serveStatic(asset) {
  if (asset === 'ui.css') {
    return new Response(ADMIN_CSS, {
      status: 200,
      headers: { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  const js = await getAdminUiBundle();
  return new Response(js, {
    status: 200,
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function handleApi(path, request, ctx) {
  // Unauthenticated routes
  if (path === '/auth/login' && request.method === 'GET') return startLogin(request, ctx);
  if (path === '/auth/callback' && request.method === 'GET') return handleCallback(request, ctx);
  if (path === '/logout' && request.method === 'POST') return handleLogout(ctx);
  if (path === '/session' && request.method === 'GET') {
    const session = await readSession(request, ctx);
    return json({ authenticated: session.ok, email: session.ok ? session.email : null });
  }

  // Everything else requires a valid session
  const session = await readSession(request, ctx);
  if (!session.ok) return json({ error: 'unauthorized' }, 401);

  if (path === '/profile' && request.method === 'GET') {
    try {
      const profile = await loadProfile(ctx.storage);
      return json({ profile });
    } catch (err) {
      return json({ error: 'load_failed', reason: errMsg(err) }, 500);
    }
  }
  if (path === '/profile' && request.method === 'PUT') {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }
    try {
      const profile = await saveProfile(ctx.storage, body?.profile ?? body);
      return json({ profile });
    } catch (err) {
      if (isValidationError(err)) {
        return json({ error: 'invalid_profile', issues: err.issues?.map((i) => i.message) ?? [] }, 400);
      }
      return json({ error: 'save_failed', reason: errMsg(err) }, 500);
    }
  }
  if (path === '/parse-resume' && request.method === 'POST') {
    return handleParseResume(request, ctx);
  }
  if (path === '/secrets' && request.method === 'GET') return handleSecretsGet(ctx);
  if (path === '/secrets' && request.method === 'PUT') return handleSecretsPut(request, ctx);
  if (path === '/secrets/test' && request.method === 'POST') return handleSecretsTest(request, ctx);

  return json({ error: 'not_found' }, 404);
}

// ---------- Secrets endpoints ----------

async function handleSecretsGet(ctx) {
  if (!ctx.secretsStorage) {
    return json({
      available: false,
      reason:
        'secrets_storage_not_configured: pass a `secretsStorage` adapter to createAdminHandler to enable the Connections UI.',
      masked: maskSecrets({}),
    });
  }
  try {
    const doc = await loadSecrets(ctx.secretsStorage);
    return json({ available: true, masked: maskSecrets(doc) });
  } catch (err) {
    return json({ error: 'load_failed', reason: errMsg(err) }, 500);
  }
}

async function handleSecretsPut(request, ctx) {
  if (!ctx.secretsStorage) {
    return json({ error: 'secrets_storage_not_configured' }, 503);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  try {
    const existing = await loadSecrets(ctx.secretsStorage);
    const merged = mergeSecretsPatch(existing, body ?? {});
    const saved = await saveSecrets(ctx.secretsStorage, merged);
    return json({ masked: maskSecrets(saved) });
  } catch (err) {
    if (isValidationError(err)) {
      return json({ error: 'invalid_secrets', issues: err.issues?.map((i) => i.message) ?? [] }, 400);
    }
    return json({ error: 'save_failed', reason: errMsg(err) }, 500);
  }
}

async function handleSecretsTest(request, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const provider = body?.provider;
  if (!provider || !PROVIDERS.includes(provider)) {
    return json({ error: 'invalid_provider' }, 400);
  }
  let secrets = null;
  if (ctx.secretsStorage) {
    try {
      secrets = await loadSecrets(ctx.secretsStorage);
    } catch (err) {
      return json({ ok: false, error: 'load_failed', reason: errMsg(err) }, 500);
    }
  }
  const apiKey = resolveApiKey({ secrets, provider, inlineFallback: ctx.llm?.apiKey });
  if (!apiKey) {
    return json({ ok: false, error: 'no_key', reason: `No API key configured for ${provider}.` });
  }
  try {
    const modelId = resolveModel(provider, ctx.llm?.models, 'chat');
    const model = getModel(provider, apiKey, modelId);
    await generateText({
      model,
      prompt: 'Reply with the single word: ok',
      maxRetries: 0,
    });
    return json({ ok: true, provider, model: modelId });
  } catch (err) {
    return json({ ok: false, error: 'llm_error', reason: errMsg(err) });
  }
}

// ---------- OAuth flow ----------

async function startLogin(request, ctx) {
  const callbackUrl = buildCallbackUrl(request);
  const state = generateRandomToken(24);
  const { verifier, challenge } = await generatePkcePair();
  const authorizeUrl = buildAuthorizeUrl({
    clientId: ctx.clientId,
    redirectUri: callbackUrl,
    state,
    codeChallenge: challenge,
  });

  const pendingPayload = encodeURIComponent(JSON.stringify({ state, verifier }));
  const setCookie = serializeCookie(ctx.pendingCookieName, pendingPayload, {
    httpOnly: true,
    sameSite: 'Lax', // Strict would block this cookie on the redirect back from Google
    secure: ctx.secureCookie,
    maxAge: PENDING_MAX_AGE,
    path: '/',
  });

  return new Response(null, {
    status: 302,
    headers: { location: authorizeUrl, 'set-cookie': setCookie },
  });
}

async function handleCallback(request, ctx) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError) return redirectToLogin(request, ctx, 'oauth_denied');
  if (!code || !state) return redirectToLogin(request, ctx, 'missing_code');

  const pending = readPendingCookie(request, ctx);
  if (!pending) return redirectToLogin(request, ctx, 'pending_expired');
  if (!constantTimeEqual(pending.state, state)) {
    return redirectToLogin(request, ctx, 'state_mismatch');
  }

  const callbackUrl = buildCallbackUrl(request);
  let tokens;
  try {
    tokens = await exchangeCodeForTokens({
      clientId: ctx.clientId,
      clientSecret: ctx.clientSecret,
      code,
      codeVerifier: pending.verifier,
      redirectUri: callbackUrl,
    });
  } catch (err) {
    console.error('[personal-assistant-chatbot] token exchange failed:', err);
    return redirectToLogin(request, ctx, 'oauth_failed');
  }

  let userInfo;
  try {
    userInfo = await fetchUserInfo(tokens.access_token);
  } catch (err) {
    console.error('[personal-assistant-chatbot] userinfo failed:', err);
    return redirectToLogin(request, ctx, 'userinfo_failed');
  }

  if (!userInfo.email_verified) {
    return redirectToLogin(request, ctx, 'email_not_verified');
  }
  const email = String(userInfo.email || '').trim().toLowerCase();
  if (!email || !ctx.allowedEmails.has(email)) {
    return redirectToLogin(request, ctx, 'unauthorized_email');
  }

  const sessionToken = await mintSessionToken(email, ctx.clientSecret);
  const sessionCookie = serializeCookie(ctx.cookieName, sessionToken, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: ctx.secureCookie,
    maxAge: ctx.cookieMaxAge,
    path: '/',
  });
  const clearPending = serializeCookie(ctx.pendingCookieName, '', {
    httpOnly: true,
    sameSite: 'Lax',
    secure: ctx.secureCookie,
    maxAge: 0,
    path: '/',
  });

  const headers = new Headers();
  headers.append('location', adminRootFromRequest(request));
  headers.append('set-cookie', sessionCookie);
  headers.append('set-cookie', clearPending);
  return new Response(null, { status: 302, headers });
}

function handleLogout(ctx) {
  const setCookie = serializeCookie(ctx.cookieName, '', {
    httpOnly: true,
    sameSite: 'Lax',
    secure: ctx.secureCookie,
    maxAge: 0,
    path: '/',
  });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...JSON_HEADERS, 'set-cookie': setCookie },
  });
}

/**
 * Parse and verify the session cookie. Returns `{ ok: true, email }` if the
 * cookie's HMAC matches and the email is currently allowlisted, otherwise
 * `{ ok: false }`. Re-checks allowlist on every request so removing an email
 * from `CHATBOT_ALLOWED_EMAILS` invalidates that user's session immediately.
 */
async function readSession(request, ctx) {
  const cookies = parseCookies(request.headers.get('cookie') ?? '');
  const token = cookies[ctx.cookieName];
  if (!token) return { ok: false };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false };
  const [emailB64, sig] = parts;
  let email;
  try {
    email = base64UrlDecode(emailB64);
  } catch {
    return { ok: false };
  }
  const expectedSig = await hmacSha256(`${ctx.clientSecret}:${SESSION_TAG}`, emailB64);
  if (!constantTimeEqual(sig, expectedSig)) return { ok: false };
  if (!ctx.allowedEmails.has(email.toLowerCase())) return { ok: false };
  return { ok: true, email };
}

async function mintSessionToken(email, clientSecret) {
  const emailB64 = base64UrlEncodeString(email);
  const sig = await hmacSha256(`${clientSecret}:${SESSION_TAG}`, emailB64);
  return `${emailB64}.${sig}`;
}

function readPendingCookie(request, ctx) {
  const cookies = parseCookies(request.headers.get('cookie') ?? '');
  const raw = cookies[ctx.pendingCookieName];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (typeof parsed?.state === 'string' && typeof parsed?.verifier === 'string') return parsed;
  } catch {
    /* fallthrough */
  }
  return null;
}

function buildCallbackUrl(request) {
  const url = new URL(request.url);
  // /admin/chatbot/api/auth/login → /admin/chatbot/api/auth/callback
  // /admin/chatbot/api/auth/callback (when re-entering on callback itself) → unchanged
  url.pathname = url.pathname
    .replace(/\/api\/auth\/login\/?$/, '/api/auth/callback')
    .replace(/\/api\/auth\/callback\/?$/, '/api/auth/callback');
  url.search = '';
  url.hash = '';
  return url.toString();
}

function adminRootFromRequest(request) {
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/\/api\/auth\/(login|callback)\/?$/, '');
  url.search = '';
  url.hash = '';
  return url.toString();
}

function redirectToLogin(request, ctx, errorCode) {
  const target = new URL(adminRootFromRequest(request));
  target.searchParams.set('error', errorCode);
  const headers = new Headers();
  headers.append('location', target.toString());
  // Wipe any stale pending cookie so the next attempt starts clean.
  headers.append(
    'set-cookie',
    serializeCookie(ctx.pendingCookieName, '', {
      httpOnly: true,
      sameSite: 'Lax',
      secure: ctx.secureCookie,
      maxAge: 0,
      path: '/',
    })
  );
  return new Response(null, { status: 302, headers });
}

// ---------- Resume parse (unchanged from password version) ----------

async function handleParseResume(request, ctx) {
  const resolved = await resolveLlmFromCtx(ctx);
  if (!resolved.ok) {
    return json(
      {
        error: 'llm_not_configured',
        reason:
          'Resume parsing requires an LLM. Set an API key in the Connections tab, or set GEMINI_API_KEY (or another provider) in your env.',
      },
      503
    );
  }
  const contentType = request.headers.get('content-type') ?? '';
  let pdfBytes = null;
  if (contentType.startsWith('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return json({ error: 'no_file' }, 400);
    if (file.size > MAX_RESUME_BYTES) return json({ error: 'file_too_large' }, 413);
    pdfBytes = new Uint8Array(await file.arrayBuffer());
  } else if (contentType.startsWith('application/pdf')) {
    const buf = await request.arrayBuffer();
    if (buf.byteLength > MAX_RESUME_BYTES) return json({ error: 'file_too_large' }, 413);
    pdfBytes = new Uint8Array(buf);
  } else {
    return json(
      { error: 'unsupported_content_type', reason: 'Expected multipart/form-data or application/pdf.' },
      415
    );
  }

  let text;
  try {
    text = await extractResumeText(pdfBytes);
  } catch (err) {
    return json({ error: 'pdf_parse_failed', reason: errMsg(err) }, 422);
  }
  if (!text.trim()) {
    return json({ error: 'pdf_empty', reason: 'The PDF had no extractable text. Is it a scanned image?' }, 422);
  }

  try {
    const partial = await structureProfileFromResume({
      text,
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      models: ctx.llm?.models,
    });
    const profile = validateProfile(partial);
    return json({ profile });
  } catch (err) {
    return json({ error: 'llm_parse_failed', reason: errMsg(err) }, 502);
  }
}

/**
 * Resolve the LLM provider + key for a server-side call (parse-resume,
 * secrets-test). Pulls from secretsStorage first, env var second, inline
 * config last. Returns `{ ok: false }` if nothing's configured.
 *
 * @param {{ secretsStorage?: import('../core/types.js').StorageAdapter, llm?: AdminLlmConfig }} ctx
 */
async function resolveLlmFromCtx(ctx) {
  let secrets = null;
  if (ctx.secretsStorage) {
    try {
      secrets = await loadSecrets(ctx.secretsStorage);
    } catch {
      secrets = null;
    }
  }
  const provider = resolveProvider({ secrets, fallback: ctx.llm?.provider });
  const apiKey = resolveApiKey({ secrets, provider, inlineFallback: ctx.llm?.apiKey });
  if (!apiKey) return { ok: false };
  return { ok: true, provider, apiKey };
}

// ---------- Cookie / response helpers ----------

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function serializeCookie(name, value, opts) {
  const parts = [`${name}=${value}`];
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (typeof opts.maxAge === 'number') parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function methodNotAllowed(allow) {
  return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
    status: 405,
    headers: { ...JSON_HEADERS, allow },
  });
}

function errMsg(err) {
  return err instanceof Error ? err.message : String(err);
}

// ---------- base64url for string payloads ----------

function base64UrlEncodeString(s) {
  const bytes = new TextEncoder().encode(s);
  const b64 =
    typeof Buffer !== 'undefined'
      ? Buffer.from(bytes).toString('base64')
      : btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s) {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  if (typeof Buffer !== 'undefined') return Buffer.from(padded, 'base64').toString('utf8');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ---------- Setup page (missing/invalid Google config) ----------

function serveSetupPage(missing) {
  const list = missing.map((m) => `<li><code>${m}</code></li>`).join('');
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Chatbot admin — setup needed</title>
  <meta name="robots" content="noindex, nofollow" />
  <style>
    body { margin: 0; font: 14px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      background: #f8fafc; color: #0f172a; padding: 64px 20px; }
    .box { max-width: 640px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0;
      border-radius: 10px; padding: 28px 32px; box-shadow: 0 1px 2px rgba(15,23,42,0.05); }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p, li { color: #334155; }
    ol { padding-left: 20px; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    pre { background: #0f172a; color: #e2e8f0; padding: 12px 14px; border-radius: 6px;
      font-size: 12px; overflow-x: auto; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Admin sign-in is not configured yet</h1>
    <p>The following environment variable${missing.length === 1 ? ' is' : 's are'} missing:</p>
    <ul>${list}</ul>
    <h2 style="font-size:15px;margin-top:24px">How to set this up</h2>
    <ol>
      <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud Console → APIs &amp; Services → Credentials</a>.</li>
      <li>Click <strong>Create credentials → OAuth client ID → Web application</strong>.</li>
      <li>Under <strong>Authorized redirect URIs</strong>, add the callback URL for this deployment. For local dev it's typically <code>http://localhost:3000/admin/chatbot/api/auth/callback</code>. For production, swap <code>http://localhost:3000</code> for your real origin.</li>
      <li>Save, then copy the <strong>Client ID</strong> and <strong>Client secret</strong>.</li>
      <li>Add the values below to your <code>.env.local</code> (or your hosting provider's env settings):</li>
    </ol>
    <pre>CHATBOT_GOOGLE_CLIENT_ID=...
CHATBOT_GOOGLE_CLIENT_SECRET=...
CHATBOT_ALLOWED_EMAILS=you@example.com</pre>
    <p style="margin-top:14px;font-size:12px;color:#64748b">
      <code>CHATBOT_ALLOWED_EMAILS</code> is comma- or space-separated and case-insensitive. Anyone signing in with a Google account not on this list is rejected.
    </p>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
