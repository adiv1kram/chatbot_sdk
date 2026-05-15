import { generateText } from 'ai';
import { getModel, resolveModel } from './providers.js';
import { isActionable } from './intent.js';
import { withAbortTimeout } from '../utils/timeout.js';

/**
 * Generate a structured lead brief from the chat transcript using the heavy model.
 * Returns null when the classification isn't actionable (caller skips onLead).
 *
 * @param {Object} args
 * @param {import('./types.js').Profile} args.profile
 * @param {import('./types.js').ChatMessage[]} args.transcript
 * @param {import('./intent.js').IntentClassification} args.classification
 * @param {import('./providers.js').ProviderName} args.provider
 * @param {string} args.apiKey
 * @param {{chat?: string, heavy?: string}} [args.models]
 * @returns {Promise<null | {
 *   visitor: { name?: string, company?: string, email?: string },
 *   topic: string,
 *   highlights: string[],
 *   nextStep?: string
 * }>}
 */
export async function generateLeadBrief({
  profile,
  transcript,
  classification,
  provider,
  apiKey,
  models,
}) {
  if (!isActionable(classification)) return null;

  const modelId = resolveModel(provider, models, 'heavy');
  const model = getModel(provider, apiKey, modelId);

  const system = [
    `You write a short brief about a conversation that came in through ${profile.name}'s AI assistant.`,
    'Extract structured details. Be faithful — if something is not in the transcript, omit it.',
    '',
    'Output STRICT JSON only, no prose:',
    '{',
    '  "visitor": { "name": "...", "company": "...", "email": "..." },',
    '  "topic": "<one-line description of the opportunity>",',
    '  "highlights": ["<short bullet 1>", "<short bullet 2>", ...],',
    '  "nextStep": "<what the visitor said they would do next>"',
    '}',
    'visitor fields are optional and should be omitted if absent. highlights should be 2–5 short bullets.',
  ].join('\n');

  const transcriptText = transcript
    .map((m) => `${m.role === 'user' ? 'VISITOR' : 'ASSISTANT'}: ${m.content}`)
    .join('\n\n');

  const result = await withAbortTimeout((abortSignal) =>
    generateText({
      model,
      system,
      prompt: `TRANSCRIPT:\n\n${transcriptText}\n\nReturn the JSON now.`,
      abortSignal,
    })
  );

  return parseBrief(result.text);
}

/**
 * @param {string} text
 */
export function parseBrief(text) {
  if (!text) return null;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      visitor: {
        name: typeof parsed?.visitor?.name === 'string' ? parsed.visitor.name : undefined,
        company: typeof parsed?.visitor?.company === 'string' ? parsed.visitor.company : undefined,
        email: typeof parsed?.visitor?.email === 'string' ? parsed.visitor.email : undefined,
      },
      topic: typeof parsed.topic === 'string' ? parsed.topic : 'Untitled',
      highlights: Array.isArray(parsed.highlights)
        ? parsed.highlights.filter((s) => typeof s === 'string').slice(0, 8)
        : [],
      nextStep: typeof parsed.nextStep === 'string' ? parsed.nextStep : undefined,
    };
  } catch {
    return null;
  }
}
