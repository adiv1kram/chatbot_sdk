import { describe, it, expect } from 'vitest';
import { resolveNotifier } from '../src/notify/index.js';

describe('resolveNotifier', () => {
  it('returns null when no notify config is given', () => {
    expect(resolveNotifier()).toBeNull();
    expect(resolveNotifier({})).toBeNull();
    expect(resolveNotifier({ notify: {} })).toBeNull();
    expect(resolveNotifier({ notify: { provider: '' } })).toBeNull();
  });

  it('returns null when Gmail is selected but refresh token / email is missing', () => {
    expect(
      resolveNotifier({
        notify: { provider: 'gmail', gmail: { refresh_token: '' } },
        google: { clientId: 'c', clientSecret: 's' },
      })
    ).toBeNull();
    expect(
      resolveNotifier({
        notify: { provider: 'gmail', gmail: { refresh_token: 'r', email: '' } },
        google: { clientId: 'c', clientSecret: 's' },
      })
    ).toBeNull();
  });

  it('returns null when Gmail is selected but Google OAuth client is missing', () => {
    expect(
      resolveNotifier({
        notify: { provider: 'gmail', gmail: { refresh_token: 'r', email: 'me@x.com' } },
        google: { clientId: '', clientSecret: '' },
      })
    ).toBeNull();
  });

  it('returns a Gmail notifier when all fields are present', () => {
    const n = resolveNotifier({
      notify: {
        provider: 'gmail',
        gmail: { refresh_token: 'rtok', email: 'me@x.com' },
        fromName: 'Me',
      },
      google: { clientId: 'cid', clientSecret: 'csec' },
    });
    expect(n).not.toBeNull();
    expect(n.kind).toBe('gmail');
    expect(typeof n.send).toBe('function');
  });

  it('returns null for SMTP when any required field is missing', () => {
    const partial = {
      host: 'smtp.example.com',
      port: 587,
      user: 'u',
      pass: 'p',
      from: 'me@example.com',
    };
    for (const field of ['host', 'port', 'user', 'pass', 'from']) {
      const smtp = { ...partial, [field]: field === 'port' ? 0 : '' };
      const result = resolveNotifier({ notify: { provider: 'smtp', smtp } });
      expect(result, `missing ${field}`).toBeNull();
    }
  });

  it('returns an SMTP notifier when fully configured', () => {
    const n = resolveNotifier({
      notify: {
        provider: 'smtp',
        smtp: {
          host: 'smtp.example.com',
          port: 587,
          user: 'u',
          pass: 'p',
          from: 'me@example.com',
        },
      },
    });
    expect(n).not.toBeNull();
    expect(n.kind).toBe('smtp');
  });
});
