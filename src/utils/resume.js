import { extractText, getDocumentProxy } from 'unpdf';
import { generateText } from 'ai';
import { getModel, resolveModel } from '../core/providers.js';
import { withAbortTimeout } from './timeout.js';

/**
 * Extract plain text from a PDF buffer using unpdf.
 *
 * @param {Uint8Array|ArrayBuffer|Buffer} buffer
 * @returns {Promise<string>}
 */
export async function extractResumeText(buffer) {
  const bytes =
    buffer instanceof Uint8Array
      ? buffer
      : new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer);
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n') : text;
}

/**
 * Ask the heavy LLM model to turn raw resume text into a partial Profile
 * (name, headline, bio, experience, education, projects). Offerings and
 * contact info aren't in resumes, so they're returned empty for the user
 * to fill in.
 *
 * @param {Object} args
 * @param {string} args.text - raw resume text
 * @param {import('../core/providers.js').ProviderName} args.provider
 * @param {string} args.apiKey
 * @param {{chat?: string, heavy?: string}} [args.models]
 * @returns {Promise<Partial<import('../core/types.js').Profile>>}
 */
export async function structureProfileFromResume({ text, provider, apiKey, models }) {
  const modelId = resolveModel(provider, models, 'heavy');
  const model = getModel(provider, apiKey, modelId);

  const system = [
    'You convert a resume into a structured JSON profile.',
    'Output STRICT JSON only — no prose, no markdown fences.',
    '',
    'Schema:',
    '{',
    '  "name": "string",',
    '  "headline": "<role · years · 1–3 specialties>",',
    '  "bio": "<2–3 sentence first-person summary>",',
    '  "experience": [',
    '    { "company": "...", "role": "...", "startDate": "YYYY-MM",',
    '      "endDate": "YYYY-MM" | null,',
    '      "description": "<one short paragraph>",',
    '      "skills": ["..."] }',
    '  ],',
    '  "education": [{ "institution": "...", "degree": "...", "year": YYYY }],',
    '  "projects": [{ "name": "...", "description": "...", "url": "...", "tech": ["..."] }]',
    '}',
    '',
    'Rules:',
    '- If a field is not in the resume, omit it (do not invent).',
    '- Dates: use YYYY-MM. Use null for endDate when the role is current.',
    '- Keep descriptions short (under 250 chars each).',
    '- Skills: up to 6 most prominent per role.',
  ].join('\n');

  const result = await withAbortTimeout((abortSignal) =>
    generateText({
      model,
      system,
      prompt: `RESUME TEXT:\n\n${text}\n\nReturn the JSON now.`,
      abortSignal,
    })
  );

  return parseProfileJson(result.text);
}

/**
 * Robustly extract the first JSON object from arbitrary LLM output.
 * Returns an empty object when nothing parses.
 *
 * @param {string} raw
 * @returns {Partial<import('../core/types.js').Profile>}
 */
export function parseProfileJson(raw) {
  if (!raw) return {};
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[0]);
    return /** @type {Partial<import('../core/types.js').Profile>} */ (parsed);
  } catch {
    return {};
  }
}
