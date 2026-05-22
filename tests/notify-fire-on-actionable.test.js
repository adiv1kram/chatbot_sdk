import { describe, it, expect, beforeEach, vi } from 'vitest';

// Control the classification path without a real LLM.
vi.mock('../src/core/intent.js', async () => {
  const actual = await vi.importActual('../src/core/intent.js');
  return { ...actual, classifyIntent: vi.fn() };
});
vi.mock('../src/core/brief.js', async () => {
  const actual = await vi.importActual('../src/core/brief.js');
  return { ...actual, generateLeadBrief: vi.fn() };
});
// The message path streams a chat reply; stub it so no real LLM call fires.
vi.mock('../src/core/chat.js', () => ({
  runChatTurn: vi.fn(() => ({
    toTextStreamResponse: () =>
      new Response('hi', { status: 200, headers: { 'content-type': 'text/plain' } }),
  })),
}));

import { createChatHandler, _flushBackgroundForTests } from '../src/server/index.js';
import { classifyIntent } from '../src/core/intent.js';
import { generateLeadBrief } from '../src/core/brief.js';
import {
  _clearDedupeForTests,
  _clearDispatchForTests,
  _clearDeliveryLogForTests,
} from '../src/notify/index.js';

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

function makeHandler(send, { notify = { to: 'pro@example.com' } } = {}) {
  return createChatHandler({
    profile,
    provider: 'gemini',
    apiKey: 'test-key',
    rateLimit: false,
    notifier: { kind: 'gmail', send },
    secretsStorage: stubSecretsStorage({ notify }),
  });
}

function messageRequest(content, sessionId) {
  return new Request('http://test.local/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'message',
      sessionId,
      messages: [
        { role: 'assistant', content: 'How can I help?' },
        { role: 'user', content },
      ],
    }),
  });
}

function endRequest(sessionId) {
  return new Request('http://test.local/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'end',
      sessionId,
      messages: [{ role: 'user', content: 'Interested in hiring you full-time.' }],
    }),
  });
}

describe('fire-when-actionable (mid-conversation lead notification)', () => {
  beforeEach(() => {
    _clearDedupeForTests();
    _clearDispatchForTests();
    _clearDeliveryLogForTests();
    classifyIntent.mockReset();
    generateLeadBrief.mockReset();
  });

  it('emails the lead mid-conversation once the visitor shares an email — no End needed', async () => {
    classifyIntent.mockResolvedValue({ classification: 'opportunity', confidence: 0.95 });
    generateLeadBrief.mockResolvedValue(sampleBrief);
    const send = vi.fn().mockResolvedValue({ ok: true, messageId: 'msg-1' });
    const handler = makeHandler(send);

    const res = await handler(
      messageRequest('I want to hire you — reach me at sarah@x.co', 'mid-1')
    );
    expect(res.status).toBe(200); // the streamed reply returns immediately

    await _flushBackgroundForTests();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe('pro@example.com');
  });

  it('does NOT classify or email when no contact handle has been shared', async () => {
    classifyIntent.mockResolvedValue({ classification: 'opportunity', confidence: 0.95 });
    generateLeadBrief.mockResolvedValue(sampleBrief);
    const send = vi.fn();
    const handler = makeHandler(send);

    await handler(messageRequest('I might be looking to hire someone eventually', 'mid-2'));
    await _flushBackgroundForTests();

    expect(classifyIntent).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('does not email when contact is shared but the intent is info_only', async () => {
    classifyIntent.mockResolvedValue({ classification: 'info_only', confidence: 0.9 });
    generateLeadBrief.mockResolvedValue(null);
    const send = vi.fn();
    const handler = makeHandler(send);

    await handler(messageRequest('just browsing, btw my email is curious@x.co', 'mid-3'));
    await _flushBackgroundForTests();

    expect(classifyIntent).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends only once across a mid-chat fire and a later End (dispatch dedupe)', async () => {
    classifyIntent.mockResolvedValue({ classification: 'opportunity', confidence: 0.95 });
    generateLeadBrief.mockResolvedValue(sampleBrief);
    const send = vi.fn().mockResolvedValue({ ok: true, messageId: 'msg-1' });
    const handler = makeHandler(send);

    await handler(messageRequest('hire me — sarah@x.co', 'mid-4'));
    await _flushBackgroundForTests();
    expect(send).toHaveBeenCalledTimes(1);

    const endRes = await handler(endRequest('mid-4'));
    const body = await endRes.json();
    expect(send).toHaveBeenCalledTimes(1); // no second email
    expect(body.emailed).toBe(false);
  });

  it('re-evaluates on later turns until actionable, then fires once', async () => {
    // Contact shared early, but the conversation only becomes actionable later.
    classifyIntent
      .mockResolvedValueOnce({ classification: 'info_only', confidence: 0.6 })
      .mockResolvedValueOnce({ classification: 'opportunity', confidence: 0.95 });
    generateLeadBrief.mockResolvedValue(sampleBrief);
    const send = vi.fn().mockResolvedValue({ ok: true, messageId: 'msg-1' });
    const handler = makeHandler(send);

    await handler(messageRequest('hi, I am sarah@x.co', 'mid-5'));
    await _flushBackgroundForTests();
    expect(send).not.toHaveBeenCalled(); // info_only on the first pass

    await handler(messageRequest('I want to hire you for a VP role, sarah@x.co', 'mid-5'));
    await _flushBackgroundForTests();
    expect(classifyIntent).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(1); // fires once it turns actionable
  });
});
