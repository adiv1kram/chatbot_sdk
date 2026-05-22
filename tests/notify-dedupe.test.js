import { describe, it, expect, beforeEach } from 'vitest';
import {
  hasAlreadySent,
  markSent,
  recordDelivery,
  getRecentDeliveries,
  _clearDedupeForTests,
  _clearDeliveryLogForTests,
} from '../src/notify/index.js';

describe('session dedupe', () => {
  beforeEach(() => {
    _clearDedupeForTests();
  });

  it('reports a session as not-yet-sent until markSent', () => {
    expect(hasAlreadySent('sess-1')).toBe(false);
    markSent('sess-1');
    expect(hasAlreadySent('sess-1')).toBe(true);
  });

  it('keeps sessions independent of each other', () => {
    markSent('sess-1');
    expect(hasAlreadySent('sess-2')).toBe(false);
  });
});

describe('delivery log', () => {
  beforeEach(() => {
    _clearDeliveryLogForTests();
  });

  it('returns newest-first', () => {
    recordDelivery({
      at: 1,
      kind: 'gmail',
      ok: true,
      to: 'a@x.co',
      subject: 'one',
    });
    recordDelivery({
      at: 2,
      kind: 'gmail',
      ok: false,
      to: 'b@x.co',
      subject: 'two',
      error: 'boom',
    });
    const log = getRecentDeliveries();
    expect(log[0].subject).toBe('two');
    expect(log[1].subject).toBe('one');
  });

  it('caps log size around 20 entries', () => {
    for (let i = 0; i < 35; i++) {
      recordDelivery({ at: i, kind: 'gmail', ok: true, to: 'x@y.co', subject: `s${i}` });
    }
    const log = getRecentDeliveries();
    expect(log.length).toBeLessThanOrEqual(20);
    // Newest preserved at the front
    expect(log[0].subject).toBe('s34');
  });
});
