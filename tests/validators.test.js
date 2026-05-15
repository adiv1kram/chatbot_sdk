import { describe, it, expect } from 'vitest';
import {
  validateChatRequest,
  validateProfile,
  isValidationError,
  isProfileConfigured,
  emptyProfile,
} from '../src/core/validators.js';

describe('validateChatRequest', () => {
  it('accepts a minimal valid message request', () => {
    const out = validateChatRequest({
      sessionId: 'abc-123',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(out.action).toBe('message');
    expect(out.sessionId).toBe('abc-123');
    expect(out.messages).toHaveLength(1);
  });

  it('accepts an explicit end action', () => {
    const out = validateChatRequest({
      action: 'end',
      sessionId: 'abc-123',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(out.action).toBe('end');
  });

  it('rejects unknown actions', () => {
    expect(() =>
      validateChatRequest({
        action: 'bogus',
        sessionId: 'abc',
        messages: [{ role: 'user', content: 'hi' }],
      })
    ).toThrow();
  });

  it('rejects empty message array', () => {
    expect(() => validateChatRequest({ sessionId: 'a', messages: [] })).toThrow();
  });

  it('rejects missing sessionId', () => {
    expect(() => validateChatRequest({ messages: [{ role: 'user', content: 'hi' }] })).toThrow();
  });

  it('rejects invalid role', () => {
    expect(() =>
      validateChatRequest({
        sessionId: 'a',
        messages: [{ role: 'system', content: 'hi' }],
      })
    ).toThrow();
  });

  it('rejects oversized message content', () => {
    expect(() =>
      validateChatRequest({
        sessionId: 'a',
        messages: [{ role: 'user', content: 'x'.repeat(8001) }],
      })
    ).toThrow();
  });
});

describe('validateProfile', () => {
  it('accepts a minimal profile', () => {
    const out = validateProfile({ name: 'Alex' });
    expect(out.name).toBe('Alex');
  });

  it('accepts a fully-populated profile', () => {
    const out = validateProfile({
      name: 'Alex',
      headline: 'Engineer',
      experience: [
        { company: 'Acme', role: 'SE', startDate: '2023-01', endDate: null, skills: ['Go'] },
      ],
      offerings: [{ type: 'consulting', description: 'short engagements' }],
      contact: { email: { value: 'a@b.co', shareInChat: false } },
      freeform: 'A note from me to the bot.',
    });
    expect(out.offerings[0].type).toBe('consulting');
    expect(out.freeform).toBe('A note from me to the bot.');
  });

  it('rejects unknown offering type', () => {
    expect(() =>
      validateProfile({
        name: 'Alex',
        offerings: [{ type: 'mystery', description: '...' }],
      })
    ).toThrow();
  });

  it('rejects mistyped fields (experience as string)', () => {
    expect(() => validateProfile({ name: 'Alex', experience: 'not an array' })).toThrow();
  });

  it('accepts an empty profile (no name yet) and fills defaults', () => {
    const out = validateProfile({});
    expect(out.name).toBe('');
    expect(out.experience).toEqual([]);
    expect(out.contact).toEqual({});
    expect(out.freeform).toBe('');
  });

  it('null input is treated as empty', () => {
    const out = validateProfile(null);
    expect(out.name).toBe('');
  });
});

describe('isProfileConfigured', () => {
  it('is false for an empty profile', () => {
    expect(isProfileConfigured(emptyProfile())).toBe(false);
    expect(isProfileConfigured(null)).toBe(false);
    expect(isProfileConfigured(undefined)).toBe(false);
  });

  it('is false when name is only whitespace', () => {
    expect(isProfileConfigured({ name: '   ' })).toBe(false);
  });

  it('is true once name is filled in', () => {
    expect(isProfileConfigured({ name: 'Alex' })).toBe(true);
  });
});

describe('isValidationError', () => {
  it('returns true for valibot errors', () => {
    try {
      validateProfile({ experience: 'not an array' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(isValidationError(err)).toBe(true);
    }
  });

  it('returns false for other errors', () => {
    expect(isValidationError(new Error('plain'))).toBe(false);
    expect(isValidationError(null)).toBe(false);
    expect(isValidationError('string')).toBe(false);
  });
});
