/**
 * Gmail notifier — sends mail via the Gmail REST API using an OAuth refresh
 * token. No external SDK; just fetch and Web Crypto.
 *
 * The refresh token is obtained at admin sign-in (with the gmail.send scope
 * granted) and persisted in secrets.json. Access tokens are short-lived and
 * minted per-send.
 *
 * @typedef {Object} GmailNotifierConfig
 * @property {string} clientId - Google OAuth client ID.
 * @property {string} clientSecret - Google OAuth client secret.
 * @property {string} refreshToken - Long-lived refresh token captured during admin OAuth.
 * @property {string} fromEmail - The Gmail address that owns the refresh token. Used as the "From" header.
 * @property {string} [fromName] - Optional display name for the From header.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

/**
 * @param {GmailNotifierConfig} config
 */
export function createGmailNotifier(config) {
  if (!config?.clientId || !config?.clientSecret || !config?.refreshToken || !config?.fromEmail) {
    throw new Error(
      'createGmailNotifier: clientId, clientSecret, refreshToken, and fromEmail are required'
    );
  }
  const fromHeader = config.fromName
    ? `${formatDisplayName(config.fromName)} <${config.fromEmail}>`
    : config.fromEmail;

  return {
    kind: /** @type {const} */ ('gmail'),
    /**
     * @param {{ to: string, subject: string, html: string, text: string, meta?: Record<string, unknown> }} msg
     */
    async send(msg) {
      const accessToken = await getAccessToken(config);
      const raw = buildRawMessage({
        from: fromHeader,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      });
      const res = await fetch(SEND_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ raw }),
      });
      if (!res.ok) {
        const errBody = await safeText(res);
        throw new Error(`Gmail send failed (${res.status}): ${errBody}`);
      }
      const data = await res.json().catch(() => ({}));
      return { ok: true, messageId: data?.id || null };
    },
  };
}

/**
 * Exchange a refresh token for an access token.
 *
 * @param {GmailNotifierConfig} config
 * @returns {Promise<string>}
 */
async function getAccessToken(config) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) {
    const errBody = await safeText(res);
    throw new Error(
      `Gmail token refresh failed (${res.status}): ${errBody}. ` +
        'The refresh token may have been revoked — sign out and back in to the admin to reconnect Gmail.'
    );
  }
  const data = await res.json();
  if (!data?.access_token) {
    throw new Error('Gmail token refresh returned no access_token');
  }
  return data.access_token;
}

/**
 * Build an RFC 5322 multipart/alternative message body, base64url-encoded
 * as Gmail's `raw` field expects.
 *
 * @param {{ from: string, to: string, subject: string, html: string, text: string }} msg
 * @returns {string}
 */
export function buildRawMessage({ from, to, subject, html, text }) {
  const boundary = `pac-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    text,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    html,
    `--${boundary}--`,
    '',
  ];
  const message = headers.join('\r\n') + '\r\n\r\n' + body.join('\r\n');
  return base64UrlEncodeString(message);
}

function encodeSubject(subject) {
  if (/^[\x20-\x7e]*$/.test(subject)) return subject;
  const b64 = base64Encode(subject);
  return `=?UTF-8?B?${b64}?=`;
}

function formatDisplayName(name) {
  if (/^[\w\s.-]+$/.test(name)) return name;
  return `"${name.replace(/"/g, '\\"')}"`;
}

function base64UrlEncodeString(s) {
  const bytes = new TextEncoder().encode(s);
  const b64 =
    typeof Buffer !== 'undefined'
      ? Buffer.from(bytes).toString('base64')
      : btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64Encode(s) {
  const bytes = new TextEncoder().encode(s);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  return btoa(String.fromCharCode(...bytes));
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '<no body>';
  }
}
