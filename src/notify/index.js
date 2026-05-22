import { createGmailNotifier } from './gmail.js';
import { createSmtpNotifier } from './smtp.js';
import { buildLeadEmail } from './template.js';

export { createGmailNotifier, createSmtpNotifier, buildLeadEmail };

/**
 * @typedef {{ kind: 'gmail'|'smtp', send: (msg: { to: string, subject: string, html: string, text: string }) => Promise<{ ok: boolean, messageId?: string|null }> }} Notifier
 *
 * @typedef {Object} NotifyConfig
 * @property {string} [provider] - "gmail" | "smtp". When omitted or unset, no email is sent.
 * @property {string} [to] - Recipient address. Required to actually send.
 * @property {string} [fromName] - Optional display name.
 * @property {{ refresh_token?: string, email?: string }} [gmail] - Gmail OAuth state captured at admin sign-in.
 * @property {{ host?: string, port?: number, secure?: boolean, user?: string, pass?: string, from?: string }} [smtp] - SMTP connection details.
 *
 * @typedef {Object} DeliveryRecord
 * @property {number} at - Unix ms timestamp.
 * @property {string} kind - 'gmail'|'smtp'|'unknown'.
 * @property {boolean} ok
 * @property {string} to
 * @property {string} subject
 * @property {string} [error] - Set when ok is false.
 * @property {string} [messageId] - Set when ok is true and the provider returned one.
 * @property {string} [sessionId] - Chat session that triggered this send. Omitted for test sends.
 */

/**
 * Build a notifier from a notify-config bag plus the Google OAuth client
 * credentials needed by the Gmail path. Returns null when no valid provider
 * config is present — callers should treat that as "email disabled".
 *
 * @param {Object} args
 * @param {NotifyConfig} [args.notify]
 * @param {{ clientId?: string, clientSecret?: string }} [args.google] - Google OAuth client (only needed for the Gmail path).
 * @returns {Notifier | null}
 */
export function resolveNotifier({ notify, google } = {}) {
  if (!notify || !notify.provider) return null;
  if (notify.provider === 'gmail') {
    const refreshToken = notify.gmail?.refresh_token;
    const fromEmail = notify.gmail?.email;
    if (!refreshToken || !fromEmail) return null;
    if (!google?.clientId || !google?.clientSecret) return null;
    return createGmailNotifier({
      clientId: google.clientId,
      clientSecret: google.clientSecret,
      refreshToken,
      fromEmail,
      fromName: notify.fromName,
    });
  }
  if (notify.provider === 'smtp') {
    const s = notify.smtp || {};
    if (!s.host || !s.port || !s.user || !s.pass || !s.from) return null;
    return createSmtpNotifier({
      host: s.host,
      port: s.port,
      secure: s.secure,
      user: s.user,
      pass: s.pass,
      from: s.from,
    });
  }
  return null;
}

// ---------- In-memory delivery log ----------
// Single-process Docker deploys are the documented target; one ring buffer
// per process is fine. The admin "Notifications" tab reads from here.

const MAX_LOG_ENTRIES = 20;
/** @type {DeliveryRecord[]} */
const deliveryLog = [];

/**
 * Append a delivery to the in-memory log. Oldest entries are dropped past
 * MAX_LOG_ENTRIES so memory doesn't grow unbounded.
 *
 * @param {DeliveryRecord} record
 */
export function recordDelivery(record) {
  deliveryLog.unshift(record);
  if (deliveryLog.length > MAX_LOG_ENTRIES) deliveryLog.length = MAX_LOG_ENTRIES;
}

/**
 * Snapshot of recent deliveries, newest first.
 *
 * @returns {DeliveryRecord[]}
 */
export function getRecentDeliveries() {
  return deliveryLog.slice();
}

/** Test-only: wipe the log between cases. */
export function _clearDeliveryLogForTests() {
  deliveryLog.length = 0;
}

// ---------- Session dedupe ----------
// One email per chat session, identified by sessionId. The set is in-memory
// and cleared on process restart — sufficient for the single-container model.

const MAX_DEDUPE_ENTRIES = 5000;
/** @type {Set<string>} */
const sentSessions = new Set();

/**
 * @param {string} sessionId
 * @returns {boolean} true if this session has already triggered a send.
 */
export function hasAlreadySent(sessionId) {
  return sentSessions.has(sessionId);
}

/**
 * Mark a session as sent so subsequent fires skip the email. Falls off the
 * front when the set gets large — an unlikely-but-possible refresh from a
 * very old session might re-send after that, which is acceptable.
 *
 * @param {string} sessionId
 */
export function markSent(sessionId) {
  if (sentSessions.size >= MAX_DEDUPE_ENTRIES) {
    const first = sentSessions.values().next().value;
    if (first) sentSessions.delete(first);
  }
  sentSessions.add(sessionId);
}

/** Test-only: wipe the dedupe set between cases. */
export function _clearDedupeForTests() {
  sentSessions.clear();
}

// ---------- Lead-dispatch dedupe ----------
// A "dispatch" is the moment we fire a lead's side-effects for the first time:
// the onLead callback plus the email attempt. The fire-when-actionable gate may
// call evaluateAndNotify on several visitor turns (while it waits for the lead
// to become actionable), and the End button may call it again as a backstop —
// this flag guarantees a single onLead and a single email attempt per session.
// Separate from `sentSessions` (which tracks successful email sends only) so the
// two concerns don't interfere. In-memory, cleared on restart — fine for the
// single-container model.

const MAX_DISPATCH_ENTRIES = 5000;
/** @type {Set<string>} */
const dispatchedLeads = new Set();

/**
 * @param {string} sessionId
 * @returns {boolean} true if this session has already dispatched its lead.
 */
export function hasDispatchedLead(sessionId) {
  return dispatchedLeads.has(sessionId);
}

/**
 * Mark a session's lead as dispatched so later turns (and the End backstop)
 * skip re-firing onLead / the email.
 * @param {string} sessionId
 */
export function markLeadDispatched(sessionId) {
  if (dispatchedLeads.size >= MAX_DISPATCH_ENTRIES) {
    const first = dispatchedLeads.values().next().value;
    if (first) dispatchedLeads.delete(first);
  }
  dispatchedLeads.add(sessionId);
}

/** Test-only: wipe the dispatch set between cases. */
export function _clearDispatchForTests() {
  dispatchedLeads.clear();
}
