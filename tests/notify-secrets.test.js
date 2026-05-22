import { describe, it, expect } from 'vitest';
import { SecretsSchema, mergeSecretsPatch, maskSecrets, maskNotify } from '../src/core/secrets.js';
import * as v from 'valibot';

describe('notify in secrets schema', () => {
  it('parses an empty doc and fills notify defaults', () => {
    const doc = v.parse(SecretsSchema, {});
    expect(doc.notify.provider).toBe('');
    expect(doc.notify.gmail).toEqual({ refresh_token: '', email: '' });
    expect(doc.notify.smtp.port).toBe(587);
  });

  it('rejects an invalid notify.provider value', () => {
    expect(() => v.parse(SecretsSchema, { notify: { provider: 'mailgun' } })).toThrow();
  });
});

describe('mergeSecretsPatch with notify', () => {
  it('writes Gmail refresh token + email and switches provider in one patch', () => {
    const out = mergeSecretsPatch(
      {},
      {
        notify: {
          provider: 'gmail',
          to: 'pro@example.com',
          gmail: { refresh_token: 'rt', email: 'me@gmail.com' },
        },
      }
    );
    expect(out.notify.provider).toBe('gmail');
    expect(out.notify.to).toBe('pro@example.com');
    expect(out.notify.gmail).toEqual({ refresh_token: 'rt', email: 'me@gmail.com' });
  });

  it('leaves untouched fields alone when only some are patched', () => {
    const before = mergeSecretsPatch(
      {},
      {
        notify: {
          provider: 'smtp',
          to: 'pro@example.com',
          smtp: {
            host: 'smtp.example.com',
            port: 587,
            user: 'u',
            pass: 'pwd',
            from: 'me@example.com',
          },
        },
      }
    );
    const after = mergeSecretsPatch(before, {
      notify: { smtp: { host: 'smtp.other.com' } },
    });
    expect(after.notify.smtp.host).toBe('smtp.other.com');
    expect(after.notify.smtp.pass).toBe('pwd'); // untouched
    expect(after.notify.to).toBe('pro@example.com'); // untouched
  });

  it('treats an empty-string apiKey/password as a clear', () => {
    const before = mergeSecretsPatch(
      {},
      {
        notify: {
          provider: 'smtp',
          smtp: { host: 'h', port: 587, user: 'u', pass: 'pwd', from: 'f' },
        },
      }
    );
    const after = mergeSecretsPatch(before, { notify: { smtp: { pass: '' } } });
    expect(after.notify.smtp.pass).toBe('');
  });

  it('coerces an unknown notify.provider in patch to empty', () => {
    const out = mergeSecretsPatch({}, { notify: { provider: 'mailgun' } });
    expect(out.notify.provider).toBe('');
  });
});

describe('maskNotify', () => {
  it('hides refresh token + smtp password', () => {
    const masked = maskNotify({
      provider: 'gmail',
      to: 'p@x.co',
      fromName: '',
      gmail: { refresh_token: 'super-secret', email: 'me@gmail.com' },
      smtp: {
        host: 'h',
        port: 587,
        secure: false,
        user: 'u',
        pass: 'topsecret123',
        from: 'me@x.co',
      },
    });
    expect(JSON.stringify(masked)).not.toContain('super-secret');
    expect(JSON.stringify(masked)).not.toContain('topsecret123');
    expect(masked.gmail.connected).toBe(true);
    expect(masked.gmail.email).toBe('me@gmail.com');
    expect(masked.smtp.passConfigured).toBe(true);
    expect(masked.smtp.passLast4).toBe('t123');
  });
});

describe('maskSecrets includes notify', () => {
  it('returns the notify section alongside providers', () => {
    const doc = v.parse(SecretsSchema, {
      notify: {
        provider: 'smtp',
        smtp: { host: 'h', port: 587, user: 'u', pass: 'p', from: 'me@x.co' },
      },
    });
    const masked = maskSecrets(doc);
    expect(masked.notify).toBeDefined();
    expect(masked.notify.provider).toBe('smtp');
  });
});
