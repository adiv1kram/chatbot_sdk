import { describe, it, expect } from 'vitest';
import { parseInitArgs } from '../src/cli/init.js';

describe('parseInitArgs', () => {
  it('captures the positional input', () => {
    const out = parseInitArgs(['./resume.pdf']);
    expect(out.input).toBe('./resume.pdf');
    expect(out.out).toBeUndefined();
    expect(out.provider).toBeUndefined();
  });

  it('captures flags in any order', () => {
    const out = parseInitArgs(['--provider', 'openai', './x.pdf', '--out', 'profile.json']);
    expect(out.input).toBe('./x.pdf');
    expect(out.provider).toBe('openai');
    expect(out.out).toBe('profile.json');
  });

  it('throws on unknown flags', () => {
    expect(() => parseInitArgs(['./x.pdf', '--bogus'])).toThrow(/Unknown flag/);
  });

  it('throws on extra positional args', () => {
    expect(() => parseInitArgs(['./x.pdf', 'extra.pdf'])).toThrow(/Unexpected argument/);
  });
});
