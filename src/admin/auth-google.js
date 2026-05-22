/**
 * Google OAuth 2.0 helpers — server-side authorization code flow with PKCE.
 *
 * Hand-rolled (no external OAuth library) to keep the SDK lean and to work
 * across Node, edge, and Web Standards runtimes. Uses `fetch` and Web Crypto
 * (`globalThis.crypto`) only.
 *
 * Flow:
 * 1. Caller hits `buildAuthorizeUrl(...)` and 302s the user to it.
 * 2. User signs in at Google → Google redirects back with `?code=...&state=...`.
 * 3. Caller verifies the state matches what it stashed in a cookie.
 * 4. Caller calls `exchangeCodeForTokens(...)` to swap the code for tokens.
 * 5. Caller calls `fetchUserInfo(...)` to get the verified email + profile.
 * 6. Caller checks `email_verified` and matches `email` against the allowlist.
 */

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

/**
 * Cryptographically random opaque token, base64url-encoded.
 * @param {number} byteLength
 * @returns {string}
 */
export function generateRandomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/**
 * Generate a PKCE verifier/challenge pair (S256). The verifier is a random
 * token; the challenge is its SHA-256 hash, base64url-encoded.
 * @returns {Promise<{ verifier: string, challenge: string }>}
 */
export async function generatePkcePair() {
  const verifier = generateRandomToken(32);
  const data = new TextEncoder().encode(verifier);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  const challenge = base64UrlEncode(new Uint8Array(digest));
  return { verifier, challenge };
}

/** OAuth scopes always requested for admin sign-in (openid identity). */
export const BASE_SCOPES = ['openid', 'email', 'profile'];
/** Additional scope requested when the admin opts into Gmail notifications. */
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

/**
 * Build the URL the user should be redirected to in order to start the
 * OAuth flow.
 *
 * @param {object} opts
 * @param {string} opts.clientId
 * @param {string} opts.redirectUri
 * @param {string} opts.state - CSRF token; caller must verify on callback.
 * @param {string} opts.codeChallenge - PKCE S256 challenge.
 * @param {string} [opts.prompt] - "consent" forces the consent screen; defaults to "select_account".
 * @param {string[]} [opts.scopes] - Override the requested scopes. Defaults to BASE_SCOPES.
 * @param {boolean} [opts.offlineAccess] - When true, requests access_type=offline + prompt=consent so Google issues a refresh token. Use this when capturing the gmail.send scope for the notifier.
 * @returns {string}
 */
export function buildAuthorizeUrl(opts) {
  const scopes = Array.isArray(opts.scopes) && opts.scopes.length ? opts.scopes : BASE_SCOPES;
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: 'S256',
    access_type: opts.offlineAccess ? 'offline' : 'online',
    // Refresh tokens are only re-issued when the consent screen is shown again.
    // Force it when we need offline access, otherwise honor the caller's prompt.
    prompt: opts.offlineAccess ? 'consent' : (opts.prompt ?? 'select_account'),
  });
  if (opts.offlineAccess) params.set('include_granted_scopes', 'true');
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens. Throws on non-2xx with the
 * Google error body in the message.
 *
 * @param {object} opts
 * @param {string} opts.clientId
 * @param {string} opts.clientSecret
 * @param {string} opts.code
 * @param {string} opts.codeVerifier - The PKCE verifier paired with the challenge sent earlier.
 * @param {string} opts.redirectUri - Must match exactly what was used in the authorize step.
 * @returns {Promise<{ access_token: string, id_token?: string, refresh_token?: string, expires_in: number, token_type: string, scope: string }>}
 */
export async function exchangeCodeForTokens(opts) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    code_verifier: opts.codeVerifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await safeText(res);
    throw new Error(`Google token exchange failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Fetch the user's profile info via Google's OIDC userinfo endpoint. The
 * `email_verified` field is the authoritative signal — never trust an email
 * without `email_verified === true`.
 *
 * @param {string} accessToken
 * @returns {Promise<{ sub: string, email?: string, email_verified?: boolean, name?: string, picture?: string }>}
 */
export async function fetchUserInfo(accessToken) {
  const res = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await safeText(res);
    throw new Error(`Google userinfo fetch failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Parse the comma/space/newline-separated CHATBOT_ALLOWED_EMAILS env value
 * into a lowercased Set for O(1) membership checks. Empty / whitespace
 * entries are dropped.
 *
 * @param {unknown} raw
 * @returns {Set<string>}
 */
export function parseAllowedEmails(raw) {
  if (typeof raw !== 'string') return new Set();
  const out = new Set();
  for (const part of raw.split(/[,\s]+/)) {
    const trimmed = part.trim().toLowerCase();
    if (trimmed) out.add(trimmed);
  }
  return out;
}

/**
 * Constant-time equality check on two strings, returning false on length
 * mismatch. Safe to call with attacker-controlled input.
 *
 * @param {string} a
 * @param {string} b
 */
export function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * HMAC-SHA256 over `payload`, keyed by `secret`, returned as base64url.
 * @param {string} secret
 * @param {string} payload
 * @returns {Promise<string>}
 */
export async function hmacSha256(secret, payload) {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(sig));
}

/**
 * @param {Uint8Array} bytes
 */
function base64UrlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '<no body>';
  }
}
