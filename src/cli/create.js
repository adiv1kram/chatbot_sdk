#!/usr/bin/env node
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, basename, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `create-personal-assistant-chatbot — scaffolder

Usage:
  npx create-personal-assistant-chatbot <dir>

Creates a new Next.js project pre-wired with the SDK: a sample profile, an API
route mounting createChatHandler, and the ChatWidget on the home page.

Examples:
  npx create-personal-assistant-chatbot my-assistant
  npx create-personal-assistant-chatbot .                  # use current empty directory
`;

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
  const targetArg = args[0];
  if (targetArg.startsWith('--')) throw new Error(`Unknown flag: ${targetArg}`);
  const target = targetArg === '.' ? process.cwd() : resolvePath(process.cwd(), targetArg);
  const projectName =
    basename(target)
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-') || 'my-assistant';

  await ensureEmptyDir(target);

  const here = dirname(fileURLToPath(import.meta.url));
  // dist/cli/create.js → templates/nextjs is at ../../templates/nextjs
  const templateDir = join(here, '..', '..', 'templates', 'nextjs');

  await copyTemplate(templateDir, target, { projectName });

  process.stdout.write(`\n✓ scaffolded ${target}\n\n`);
  process.stdout.write('Next steps:\n');
  process.stdout.write(`  1. cd ${targetArg === '.' ? '.' : targetArg}\n`);
  process.stdout.write('  2. cp .env.local.example .env.local\n');
  process.stdout.write('  3. Open .env.local and fill in:\n');
  process.stdout.write('     - GEMINI_API_KEY        (free at https://aistudio.google.com/apikey)\n');
  process.stdout.write('     - CHATBOT_GOOGLE_CLIENT_ID + CHATBOT_GOOGLE_CLIENT_SECRET\n');
  process.stdout.write('       (create at https://console.cloud.google.com/apis/credentials —\n');
  process.stdout.write('        register http://localhost:3000/admin/chatbot/api/auth/callback)\n');
  process.stdout.write('     - CHATBOT_ALLOWED_EMAILS (your own Google account email)\n');
  process.stdout.write('  4. npm install\n');
  process.stdout.write('  5. npm run dev\n\n');
  process.stdout.write('Then open http://localhost:3000/admin/chatbot, sign in with Google,\n');
  process.stdout.write('and upload a resume or fill in your profile.\n');
}

/**
 * @param {string} dir
 */
async function ensureEmptyDir(dir) {
  try {
    const entries = await readdir(dir);
    const visible = entries.filter((e) => !e.startsWith('.'));
    if (visible.length > 0) {
      throw new Error(`Target directory is not empty: ${dir}`);
    }
  } catch (err) {
    if (err && /** @type {any} */ (err).code === 'ENOENT') {
      await mkdir(dir, { recursive: true });
    } else {
      throw err;
    }
  }
}

/**
 * @param {string} src
 * @param {string} dest
 * @param {{ projectName: string }} vars
 */
async function copyTemplate(src, dest, vars) {
  const srcStat = await stat(src).catch(() => null);
  if (!srcStat) throw new Error(`Template directory missing: ${src}`);

  for await (const entry of walk(src)) {
    const rel = entry.path.slice(src.length).replace(/^\//, '');
    const renamed = renameDotfile(rel);
    const target = join(dest, renamed);
    await mkdir(dirname(target), { recursive: true });
    const raw = await readFile(entry.path, 'utf8');
    const substituted = substitute(raw, vars);
    await writeFile(target, substituted, 'utf8');
  }
}

/**
 * Files in the published template prefixed with `_` get their leading underscore
 * turned back into a dot (e.g. `_gitignore` → `.gitignore`). This sidesteps
 * npm's behavior of excluding dotfiles from published packages.
 *
 * @param {string} relPath
 */
export function renameDotfile(relPath) {
  return relPath
    .split('/')
    .map((seg) => (seg.startsWith('_') ? '.' + seg.slice(1) : seg))
    .join('/');
}

/**
 * @param {string} text
 * @param {Record<string, string>} vars
 */
export function substitute(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

/**
 * Recursively yield every file under a directory.
 * @param {string} dir
 * @returns {AsyncGenerator<{ path: string }>}
 */
async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(full);
    } else if (e.isFile()) {
      yield { path: full };
    }
  }
}
