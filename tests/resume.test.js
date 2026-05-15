import { describe, it, expect } from 'vitest';
import { parseProfileJson } from '../src/utils/resume.js';

describe('parseProfileJson', () => {
  it('parses a typical LLM JSON output', () => {
    const raw = JSON.stringify({
      name: 'Alex',
      headline: 'Senior Engineer',
      experience: [{ company: 'X', role: 'Y', startDate: '2020-01', endDate: null }],
    });
    const out = parseProfileJson(raw);
    expect(out.name).toBe('Alex');
    expect(out.experience).toHaveLength(1);
  });

  it('extracts JSON when surrounded by prose', () => {
    const raw = 'Here you go:\n\n```\n{"name":"Alex"}\n```\n';
    const out = parseProfileJson(raw);
    expect(out.name).toBe('Alex');
  });

  it('returns {} on empty or malformed input', () => {
    expect(parseProfileJson('')).toEqual({});
    expect(parseProfileJson('totally not JSON')).toEqual({});
    expect(parseProfileJson('{ broken json')).toEqual({});
  });
});
