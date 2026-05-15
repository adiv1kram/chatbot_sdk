import { streamText } from 'ai';
import { getModel, resolveModel } from './providers.js';
import { buildSystemPrompt } from './system-prompt.js';

/**
 * Run a streaming chat turn. Stateless — caller passes the full message history.
 * Returns the streamText result so the caller can pipe textStream or
 * toTextStreamResponse() into the HTTP response.
 *
 * Note: the return type is intentionally `any` because the AI SDK's
 * StreamTextResult references private class members that can't be emitted
 * to the published .d.ts. Callers that need typing should reach into
 * `import('ai').streamText` directly.
 *
 * @param {Object} args
 * @param {import('./types.js').Profile} args.profile
 * @param {import('./providers.js').ProviderName} args.provider
 * @param {string} args.apiKey
 * @param {{chat?: string, heavy?: string}} [args.models]
 * @param {import('./types.js').ChatMessage[]} args.messages
 * @returns {any}
 */
export function runChatTurn({ profile, provider, apiKey, models, messages, nearLimitNudge = false }) {
  const systemPrompt = buildSystemPrompt(profile, { nearLimitNudge });
  const modelId = resolveModel(provider, models, 'chat');
  const model = getModel(provider, apiKey, modelId);

  return streamText({
    model,
    system: systemPrompt,
    messages,
  });
}
