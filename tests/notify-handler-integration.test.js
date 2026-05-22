import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createChatHandler } from '../src/server/index.js';
import {
  _clearDedupeForTests,
  _clearDeliveryLogForTests,
  _clearDispatchForTests,
  getRecentDeliveries,
} from '../src/notify/index.js';

// Stub the intent + brief modules so we can control the classification path
// without invoking a real LLM.
vi.mock('../src/core/intent.js', async () => {
  const actual = await vi.importActual('../src/core/intent.js');
  return {
    ...actual,
    classifyIntent: vi.fn(),
  };
});
vi.mock('../src/core/brief.js', async () => {
  const actual = await vi.importActual('../src/core/brief.js');
  return {
    ...actual,
    generateLeadBrief: vi.fn(),
  };
});

import { classifyIntent } from '../src/core/intent.js';
import { generateLeadBrief } from '../src/core/brief.js';

const profile = {
  name: 'Jordan Lee',
  headline: 'Senior engineer',
  bio: 'A bio.',
  experience: [],
  education: [],
  projects: [],
  skills: ['Go'],
  offerings: [],
  contact: {},
  preferences: {},
  guardrails: {},
  disclosure: {},
  freeform: '',
};

const sampleBrief = {
  visitor: { name: 'Sarah', email: 'sarah@x.co', company: 'Acme' },
  topic: 'VP role',
  highlights: ['Series B'],
  nextStep: 'Call next week',
};

function buildHandler(notifier, { provider = 'opportunity' } = {}) {
  classifyIntent.mockResolvedValue({ classification: provider, confidence: 0.95 });
  generateLeadBrief.mockResolvedValue(sampleBrief);
  return createChatHandler({
    profile,
    provider: 'gemini',
    apiKey: 'test-key',
    rateLimit: false,
    notifier,
  });
}

function endRequest(sessionId = 'sess-1') {
  return new Request('http://test.local/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'end',
      sessionId,
      messages: [
        { role: 'user', content: 'Interested in hiring you full-time.' },
        { role: 'assistant', content: 'Tell me more.' },
      ],
    }),
  });
}

describe('chat handler → notifier wiring', () => {
  beforeEach(() => {
    _clearDedupeForTests();
    _clearDispatchForTests();
    _clearDeliveryLogForTests();
    classifyIntent.mockReset();
    generateLeadBrief.mockReset();
  });

  it('sends one email when classification is opportunity', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, messageId: 'msg-1' });
    const notifier = { kind: 'gmail', send };
    buildHandler(notifier); // primes the classifyIntent/generateLeadBrief mocks
    // The handler resolves `to` via secretsStorage at send-time, so we wire
    // a stub adapter that returns a notify.to value.
    const handlerWithTo = createChatHandler({
      profile,
      provider: 'gemini',
      apiKey: 'test-key',
      rateLimit: false,
      notifier,
      secretsStorage: stubSecretsStorage({ notify: { to: 'pro@example.com' } }),
    });
    const res = await handlerWithTo(endRequest('s-opp'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.classification).toBe('opportunity');
    expect(body.emailed).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe('pro@example.com');
    expect(send.mock.calls[0][0].subject).toMatch(/opportunity/i);
  });

  it('also sends on needs_followup (widened 2026-05-20: any actionable lead emails)', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, messageId: 'msg-2' });
    const handler = createChatHandler({
      profile,
      provider: 'gemini',
      apiKey: 'test-key',
      rateLimit: false,
      notifier: { kind: 'gmail', send },
      secretsStorage: stubSecretsStorage({ notify: { to: 'pro@example.com' } }),
    });
    classifyIntent.mockResolvedValue({ classification: 'needs_followup', confidence: 0.9 });
    generateLeadBrief.mockResolvedValue(sampleBrief);

    const res = await handler(endRequest('s-needs'));
    const body = await res.json();
    expect(body.classification).toBe('needs_followup');
    expect(body.emailed).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    // Subject for needs_followup says "lead", not "opportunity".
    expect(send.mock.calls[0][0].subject).toMatch(/lead/i);
    expect(send.mock.calls[0][0].subject).not.toMatch(/opportunity/i);
  });

  it('does NOT send on spam or info_only classifications', async () => {
    const send = vi.fn();
    const handler = createChatHandler({
      profile,
      provider: 'gemini',
      apiKey: 'test-key',
      rateLimit: false,
      notifier: { kind: 'gmail', send },
      secretsStorage: stubSecretsStorage({ notify: { to: 'pro@example.com' } }),
    });
    for (const cls of ['spam', 'info_only']) {
      classifyIntent.mockResolvedValueOnce({ classification: cls, confidence: 0.9 });
      generateLeadBrief.mockResolvedValueOnce(null);
      const res = await handler(endRequest(`s-${cls}`));
      const body = await res.json();
      expect(body.emailed).toBe(false);
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('dedupes by sessionId — second end-call from same session does not re-send', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, messageId: 'msg-1' });
    const handler = createChatHandler({
      profile,
      provider: 'gemini',
      apiKey: 'test-key',
      rateLimit: false,
      notifier: { kind: 'gmail', send },
      secretsStorage: stubSecretsStorage({ notify: { to: 'pro@example.com' } }),
    });
    classifyIntent.mockResolvedValue({ classification: 'opportunity', confidence: 0.9 });
    generateLeadBrief.mockResolvedValue(sampleBrief);

    await handler(endRequest('s-dup'));
    const second = await handler(endRequest('s-dup'));
    const body = await second.json();
    expect(send).toHaveBeenCalledTimes(1);
    expect(body.emailed).toBe(false);
  });

  it('does not bubble notifier failures into the chat response', async () => {
    const send = vi.fn().mockRejectedValue(new Error('SMTP host unreachable'));
    const handler = createChatHandler({
      profile,
      provider: 'gemini',
      apiKey: 'test-key',
      rateLimit: false,
      notifier: { kind: 'smtp', send },
      secretsStorage: stubSecretsStorage({ notify: { to: 'pro@example.com' } }),
    });
    classifyIntent.mockResolvedValue({ classification: 'opportunity', confidence: 0.95 });
    generateLeadBrief.mockResolvedValue(sampleBrief);

    const res = await handler(endRequest('s-fail'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.emailed).toBe(false);
    // Failure is recorded in the delivery log.
    const log = getRecentDeliveries();
    expect(log[0].ok).toBe(false);
    expect(log[0].error).toMatch(/SMTP host unreachable/);
  });

  it('records a failure when no recipient is configured', async () => {
    const send = vi.fn();
    const handler = createChatHandler({
      profile,
      provider: 'gemini',
      apiKey: 'test-key',
      rateLimit: false,
      notifier: { kind: 'gmail', send },
      // No notify.to configured
      secretsStorage: stubSecretsStorage({}),
    });
    classifyIntent.mockResolvedValue({ classification: 'opportunity', confidence: 0.95 });
    generateLeadBrief.mockResolvedValue(sampleBrief);

    const res = await handler(endRequest('s-nr'));
    const body = await res.json();
    expect(body.emailed).toBe(false);
    expect(send).not.toHaveBeenCalled();
    const log = getRecentDeliveries();
    expect(log[0].error).toMatch(/recipient/i);
  });
});

function stubSecretsStorage(doc) {
  return {
    type: 'filesystem',
    supportsSecrets: true,
    async read() {
      return JSON.stringify(doc);
    },
    async write() {
      /* no-op */
    },
  };
}
