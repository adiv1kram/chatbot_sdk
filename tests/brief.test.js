import { describe, it, expect } from 'vitest';
import { parseBrief } from '../src/core/brief.js';

describe('parseBrief', () => {
  it('parses a well-formed brief', () => {
    const raw = JSON.stringify({
      visitor: { name: 'Sarah Chen', company: 'Innovate Inc', email: 'sarah@x.co' },
      topic: 'VP of Engineering role',
      highlights: ['Series B', '$400-500k'],
      nextStep: 'Sarah will book via Calendly',
    });
    const out = parseBrief(raw);
    expect(out.visitor.name).toBe('Sarah Chen');
    expect(out.visitor.company).toBe('Innovate Inc');
    expect(out.topic).toBe('VP of Engineering role');
    expect(out.highlights).toEqual(['Series B', '$400-500k']);
    expect(out.nextStep).toContain('Calendly');
  });

  it('strips non-string highlights', () => {
    const raw = JSON.stringify({
      topic: 'Test',
      highlights: ['ok', 123, null, 'good'],
    });
    const out = parseBrief(raw);
    expect(out.highlights).toEqual(['ok', 'good']);
  });

  it('caps highlights at 8 entries', () => {
    const raw = JSON.stringify({
      topic: 'Test',
      highlights: Array.from({ length: 20 }, (_, i) => `h${i}`),
    });
    const out = parseBrief(raw);
    expect(out.highlights).toHaveLength(8);
  });

  it('returns null on completely malformed input', () => {
    expect(parseBrief('not even close')).toBeNull();
    expect(parseBrief('')).toBeNull();
  });

  it('omits visitor fields that are not strings', () => {
    const raw = JSON.stringify({
      visitor: { name: 'Sarah', company: 42, email: null },
      topic: 'x',
    });
    const out = parseBrief(raw);
    expect(out.visitor.name).toBe('Sarah');
    expect(out.visitor.company).toBeUndefined();
    expect(out.visitor.email).toBeUndefined();
  });

  it("defaults topic to 'Untitled' when missing", () => {
    const raw = JSON.stringify({ visitor: { name: 'Sarah' } });
    const out = parseBrief(raw);
    expect(out.topic).toBe('Untitled');
  });
});
