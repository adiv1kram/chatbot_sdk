#!/usr/bin/env node
import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractResumeText, structureProfileFromResume } from '../utils/resume.js';
import { validateProfile } from '../core/validators.js';

const HELP = `personal-assistant-chatbot — CLI

Usage:
  personal-assistant-chatbot init <resume.pdf> [--out profile.json] [--provider gemini]

Parses a resume PDF locally with unpdf, sends the extracted text to your chosen
LLM to structure it, and writes a profile.json file you can review or edit. The
file is the same one the /admin route reads and writes — once written, you can
visit /admin/chatbot in your running app to finish setup.

Options:
  --out <path>        Where to write the profile (default: ./profile.json)
  --provider <name>   gemini | openai | anthropic | groq | openrouter (default: gemini)
                      The matching env var must be set: GEMINI_API_KEY, OPENAI_API_KEY, etc.

Examples:
  GEMINI_API_KEY=... personal-assistant-chatbot init ./resume.pdf
  GEMINI_API_KEY=... personal-assistant-chatbot init ./resume.pdf --out ./profile.json
`;

const ENV_KEY = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(`\n✖ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(HELP);
    return;
  }
  if (args[0] !== 'init') {
    throw new Error(`Unknown command "${args[0]}". Try: --help`);
  }

  const opts = parseInitArgs(args.slice(1));
  if (!opts.input) throw new Error('Missing path to resume PDF. Try: --help');

  const provider = opts.provider ?? 'gemini';
  const envKey = ENV_KEY[provider];
  if (!envKey) throw new Error(`Unknown provider "${provider}".`);
  const apiKey = process.env[envKey];
  if (!apiKey) {
    throw new Error(
      `Missing ${envKey}. Set it before running:  ${envKey}=... personal-assistant-chatbot init …`
    );
  }

  const absInput = resolve(process.cwd(), opts.input);
  await stat(absInput).catch(() => {
    throw new Error(`Resume file not found: ${absInput}`);
  });

  const outPath = resolve(process.cwd(), opts.out ?? 'profile.json');

  process.stdout.write(`• reading ${absInput}\n`);
  const buf = await readFile(absInput);

  process.stdout.write('• extracting text from PDF\n');
  const text = await extractResumeText(buf);
  if (!text.trim()) throw new Error('PDF had no extractable text.');

  process.stdout.write(`• structuring with ${provider} (this can take 5–20s)…\n`);
  const partial = await structureProfileFromResume({ text, provider, apiKey });

  if (!partial.name) {
    throw new Error('LLM could not extract a name from the resume; check the PDF or try again.');
  }

  const profile = validateProfile(partial);
  await writeFile(outPath, JSON.stringify(profile, null, 2) + '\n', 'utf8');

  process.stdout.write(`\n✓ wrote ${outPath}\n`);
  process.stdout.write('\nNext steps:\n');
  process.stdout.write(
    '  1. Start your app and visit /admin/chatbot to fill in offerings, contact, and anything else.\n'
  );
  process.stdout.write(
    '  2. Or open the JSON file in your editor and edit it directly — both work.\n'
  );
}

/**
 * @param {string[]} args
 */
export function parseInitArgs(args) {
  /** @type {{input?: string, out?: string, provider?: string}} */
  const out = {};
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '--out') {
      out.out = args[++i];
    } else if (a === '--provider') {
      out.provider = args[++i];
    } else if (a.startsWith('--')) {
      throw new Error(`Unknown flag: ${a}`);
    } else if (!out.input) {
      out.input = a;
    } else {
      throw new Error(`Unexpected argument: ${a}`);
    }
    i++;
  }
  return out;
}
