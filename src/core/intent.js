import { generateText } from 'ai';
import { getModel, resolveModel } from './providers.js';
import { withAbortTimeout } from '../utils/timeout.js';

/**
 * @typedef {'spam'|'info_only'|'opportunity'|'needs_followup'} IntentClassification
 */

const CLASSIFICATIONS = ['spam', 'info_only', 'opportunity', 'needs_followup'];

/**
 * Run end-of-chat intent classification using the heavy model.
 * Returns { classification, confidence }. Falls back to 'info_only' on parse
 * failure so we don't accidentally email a low-quality lead.
 *
 * @param {Object} args
 * @param {import('./types.js').Profile} args.profile
 * @param {import('./types.js').ChatMessage[]} args.transcript
 * @param {import('./providers.js').ProviderName} args.provider
 * @param {string} args.apiKey
 * @param {{chat?: string, heavy?: string}} [args.models]
 * @returns {Promise<{ classification: IntentClassification, confidence: number }>}
 */
export async function classifyIntent({ profile, transcript, provider, apiKey, models }) {
  const modelId = resolveModel(provider, models, 'heavy');
  const model = getModel(provider, apiKey, modelId);

  const system = [
    `You classify the intent of conversations a visitor had with ${profile.name}'s AI assistant.`,
    'Pick exactly ONE label that best describes the visitor:',
    '- spam: abusive, nonsense, or clearly off-topic.',
    '- info_only: browsed/asked light questions, no real ask or follow-up.',
    '- opportunity: a concrete job, consulting, advisory, speaking, mentorship, or collaboration proposal.',
    '- needs_followup: wants a real conversation/call/meeting but did not finalize anything.',
    '',
    'Output STRICT JSON only, no prose:',
    '{ "classification": "spam"|"info_only"|"opportunity"|"needs_followup", "confidence": <0..1> }',
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

  return parseClassification(result.text);
}

/**
 * @param {string} text
 * @returns {{ classification: IntentClassification, confidence: number }}
 */
export function parseClassification(text) {
  const fallback = { classification: /** @type {const} */ ('info_only'), confidence: 0 };
  if (!text) return fallback;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return fallback;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const classification = CLASSIFICATIONS.includes(parsed.classification)
      ? parsed.classification
      : 'info_only';
    const confidence =
      typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
    return { classification, confidence };
  } catch {
    return fallback;
  }
}

/**
 * Whether a given classification should trigger an onLead callback.
 * @param {IntentClassification} classification
 * @returns {boolean}
 */
export function isActionable(classification) {
  return classification === 'opportunity' || classification === 'needs_followup';
}
