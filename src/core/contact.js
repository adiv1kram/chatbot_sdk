/**
 * Cheap, no-LLM detection of whether the visitor has shared a reachable
 * contact handle (email or phone) anywhere in their messages.
 *
 * This is the gate that decides whether a mid-conversation lead evaluation is
 * worth running. Casual visitors who never share contact info never trip it,
 * so they never incur a classification call — the LLM cost is paid only for
 * conversations that already look like real leads. It also doubles as a
 * relevance check: a lead the professional can't reply to isn't worth emailing.
 *
 * Email matching is high-precision. Phone matching is deliberately conservative
 * (requires a leading `+` or separators, plus at least 7 digits) so it doesn't
 * fire on prices, years, or counts a visitor mentions in passing.
 */

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

// Two accepted phone shapes:
//  - international: starts with "+", then digits/separators, ends with a digit
//  - grouped local: 3-3-4 split by spaces, dots, or hyphens (e.g. 415 555 0132)
const PHONE_RE = /(?:\+\d[\d\s().-]{6,}\d)|(?:\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b)/;

/**
 * @param {string} text
 * @returns {boolean}
 */
function looksLikePhone(text) {
  const match = text.match(PHONE_RE);
  if (!match) return false;
  const digits = (match[0].match(/\d/g) || []).length;
  return digits >= 7;
}

/**
 * @param {{ role?: string, content?: unknown }[] | undefined} messages
 * @returns {boolean} true if any visitor (`role: 'user'`) message contains an
 *   email address or a phone number.
 */
export function hasContactHandle(messages) {
  if (!Array.isArray(messages)) return false;
  for (const m of messages) {
    if (!m || m.role !== 'user' || typeof m.content !== 'string') continue;
    if (EMAIL_RE.test(m.content)) return true;
    if (looksLikePhone(m.content)) return true;
  }
  return false;
}
