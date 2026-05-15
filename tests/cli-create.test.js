import { describe, it, expect } from 'vitest';
import { renameDotfile, substitute } from '../src/cli/create.js';

describe('renameDotfile', () => {
  it('turns _gitignore into .gitignore', () => {
    expect(renameDotfile('_gitignore')).toBe('.gitignore');
  });

  it('turns _env.local.example into .env.local.example', () => {
    expect(renameDotfile('_env.local.example')).toBe('.env.local.example');
  });

  it('leaves non-underscored filenames alone', () => {
    expect(renameDotfile('package.json')).toBe('package.json');
    expect(renameDotfile('app/page.jsx')).toBe('app/page.jsx');
  });

  it('handles nested dotfile renames', () => {
    expect(renameDotfile('config/_eslintrc')).toBe('config/.eslintrc');
  });
});

describe('substitute', () => {
  it('replaces known placeholders', () => {
    expect(substitute('Hello, {{name}}!', { name: 'Alex' })).toBe('Hello, Alex!');
  });

  it('leaves unknown placeholders intact', () => {
    expect(substitute('{{name}} {{missing}}', { name: 'X' })).toBe('X {{missing}}');
  });

  it('handles multiple substitutions in one string', () => {
    expect(substitute('{{a}} and {{b}} and {{a}}', { a: '1', b: '2' })).toBe('1 and 2 and 1');
  });

  it('returns input unchanged when no placeholders are present', () => {
    expect(substitute('plain text', { unused: 'x' })).toBe('plain text');
  });
});
