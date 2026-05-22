import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createGmailNotifier, buildRawMessage } from '../src/notify/gmail.js';

describe('buildRawMessage', () => {
  it('emits a multipart/alternative message with both text and html parts', () => {
    const raw = buildRawMessage({
      from: 'me@example.com',
      to: 'pro@example.com',
      subject: 'Hello',
      text: 'plain body',
      html: '<p>html body</p>',
    });
    // base64url → base64 → decode
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((raw.length + 3) % 4);
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    expect(decoded).toContain('From: me@example.com');
    expect(decoded).toContain('To: pro@example.com');
    expect(decoded).toContain('Subject: Hello');
    expect(decoded).toContain('Content-Type: multipart/alternative');
    expect(decoded).toContain('plain body');
    expect(decoded).toContain('<p>html body</p>');
  });

  it('RFC2047-encodes non-ASCII subjects', () => {
    const raw = buildRawMessage({
      from: 'me@example.com',
      to: 'you@example.com',
      subject: 'Café',
      text: 't',
      html: 'h',
    });
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((raw.length + 3) % 4);
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    expect(decoded).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
  });
});

describe('createGmailNotifier', () => {
  /** @type {ReturnType<typeof vi.spyOn>} */
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('refreshes access token then POSTs to gmail send and returns messageId', async () => {
    fetchSpy.mockImplementation(async (url) => {
      if (String(url).includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'AT' }), { status: 200 });
      }
      if (String(url).includes('gmail.googleapis.com')) {
        return new Response(JSON.stringify({ id: 'msg-123', threadId: 't-1' }), { status: 200 });
      }
      throw new Error('unexpected url ' + url);
    });

    const notifier = createGmailNotifier({
      clientId: 'cid',
      clientSecret: 'csec',
      refreshToken: 'rtok',
      fromEmail: 'me@example.com',
      fromName: 'Me',
    });

    const res = await notifier.send({
      to: 'pro@example.com',
      subject: 'hi',
      html: '<p>hi</p>',
      text: 'hi',
    });
    expect(res).toEqual({ ok: true, messageId: 'msg-123' });

    // Confirm both endpoints were called and the bearer was set.
    const sendCall = fetchSpy.mock.calls.find(([u]) => String(u).includes('gmail.googleapis.com'));
    expect(sendCall).toBeDefined();
    expect(sendCall[1].headers.authorization).toBe('Bearer AT');
    const body = JSON.parse(sendCall[1].body);
    expect(typeof body.raw).toBe('string');
    expect(body.raw.length).toBeGreaterThan(20);
  });

  it('surfaces a useful error when the refresh token is rejected', async () => {
    fetchSpy.mockImplementation(
      async () => new Response('{"error":"invalid_grant"}', { status: 400 })
    );
    const notifier = createGmailNotifier({
      clientId: 'cid',
      clientSecret: 'csec',
      refreshToken: 'rtok',
      fromEmail: 'me@example.com',
    });
    await expect(
      notifier.send({ to: 'pro@example.com', subject: 's', html: 'h', text: 't' })
    ).rejects.toThrow(/refresh token may have been revoked/i);
  });

  it('surfaces send errors with the response body', async () => {
    fetchSpy.mockImplementation(async (url) => {
      if (String(url).includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'AT' }), { status: 200 });
      }
      return new Response('quota exceeded', { status: 429 });
    });
    const notifier = createGmailNotifier({
      clientId: 'cid',
      clientSecret: 'csec',
      refreshToken: 'rtok',
      fromEmail: 'me@example.com',
    });
    await expect(
      notifier.send({ to: 'p@e.com', subject: 's', html: 'h', text: 't' })
    ).rejects.toThrow(/Gmail send failed \(429\): quota exceeded/);
  });

  it('throws at construction time when required fields are missing', () => {
    expect(() =>
      createGmailNotifier({ clientId: '', clientSecret: 'x', refreshToken: 'x', fromEmail: 'x' })
    ).toThrow(/required/);
  });
});
