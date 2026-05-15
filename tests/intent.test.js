import { describe, it, expect } from 'vitest';
import { parseClassification, isActionable } from '../src/core/intent.js';

describe('parseClassification', () => {
  it('parses a clean JSON response', () => {
    const out = parseClassification('{"classification":"opportunity","confidence":0.91}');
    expect(out).toEqual({ classification: 'opportunity', confidence: 0.91 });
  });

  it('parses JSON embedded in prose', () => {
    const out = parseClassification(
      'Sure — here is the result:\n\n{"classification":"spam","confidence":0.4}\n\nLet me know.'
    );
    expect(out.classification).toBe('spam');
  });

  it('clamps confidence to [0, 1]', () => {
    expect(
      parseClassification('{"classification":"opportunity","confidence":1.7}').confidence
    ).toBe(1);
    expect(parseClassification('{"classification":"opportunity","confidence":-1}').confidence).toBe(
      0
    );
  });

  it('coerces an unknown classification to info_only', () => {
    const out = parseClassification('{"classification":"weird","confidence":0.5}');
    expect(out.classification).toBe('info_only');
  });

  it('falls back on malformed JSON', () => {
    expect(parseClassification('not json at all')).toEqual({
      classification: 'info_only',
      confidence: 0,
    });
    expect(parseClassification('{ broken')).toEqual({
      classification: 'info_only',
      confidence: 0,
    });
    expect(parseClassification('')).toEqual({
      classification: 'info_only',
      confidence: 0,
    });
  });
});

describe('isActionable', () => {
  it('flags opportunity + needs_followup as actionable', () => {
    expect(isActionable('opportunity')).toBe(true);
    expect(isActionable('needs_followup')).toBe(true);
  });

  it('flags spam and info_only as not actionable', () => {
    expect(isActionable('spam')).toBe(false);
    expect(isActionable('info_only')).toBe(false);
  });
});
