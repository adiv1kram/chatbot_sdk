import { describe, it, expect } from 'vitest';
import { hasContactHandle } from '../src/core/contact.js';

const user = (content) => ({ role: 'user', content });
const bot = (content) => ({ role: 'assistant', content });

describe('hasContactHandle', () => {
  it('detects an email in a visitor message', () => {
    expect(hasContactHandle([user('reach me at sarah@acme.co please')])).toBe(true);
  });

  it('detects an international phone number', () => {
    expect(hasContactHandle([user('call me on +1 415 555 0132')])).toBe(true);
  });

  it('detects a grouped local phone number', () => {
    expect(hasContactHandle([user('my number is 415-555-0132')])).toBe(true);
  });

  it('returns false when no contact handle is present', () => {
    expect(hasContactHandle([user('I run a Series B startup and want to hire')])).toBe(false);
  });

  it('does not treat prices or years as phone numbers', () => {
    expect(hasContactHandle([user('budget is $50,000 for a 2026 project')])).toBe(false);
    expect(hasContactHandle([user('we did 1.2 million in revenue in 2024')])).toBe(false);
  });

  it('ignores contact handles that only appear in assistant messages', () => {
    // The assistant may echo a placeholder address; only the visitor sharing
    // their own handle should trip the gate.
    expect(hasContactHandle([bot('you can email hello@example.com'), user('thanks!')])).toBe(false);
  });

  it('handles missing / malformed input safely', () => {
    expect(hasContactHandle(undefined)).toBe(false);
    expect(hasContactHandle([])).toBe(false);
    expect(hasContactHandle([{ role: 'user' }, null, { role: 'user', content: 42 }])).toBe(false);
  });
});
