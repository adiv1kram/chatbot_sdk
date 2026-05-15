import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGroq } from '@ai-sdk/groq';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

/**
 * @typedef {'gemini'|'openai'|'anthropic'|'groq'|'openrouter'} ProviderName
 */

/**
 * Recommended model defaults per provider.
 * `chat` is used for live visitor conversation; `heavy` is used for one-off
 * jobs like intent classification and brief generation.
 */
export const DEFAULT_MODELS = {
  gemini: { chat: 'gemini-2.5-flash', heavy: 'gemini-2.5-pro' },
  openai: { chat: 'gpt-4o-mini', heavy: 'gpt-4o' },
  anthropic: { chat: 'claude-haiku-4-5', heavy: 'claude-sonnet-4-5' },
  groq: { chat: 'llama-3.3-70b-versatile', heavy: 'llama-3.3-70b-versatile' },
  openrouter: { chat: 'google/gemini-2.5-flash', heavy: 'google/gemini-2.5-pro' },
};

/**
 * Resolve the model id for a given provider and kind, taking caller overrides.
 *
 * @param {ProviderName} provider
 * @param {{chat?: string, heavy?: string}|undefined} overrides
 * @param {'chat'|'heavy'} [kind]
 * @returns {string}
 */
export function resolveModel(provider, overrides, kind = 'chat') {
  const override = overrides?.[kind];
  if (override) return override;
  const defaults = DEFAULT_MODELS[provider];
  if (!defaults) throw new Error(`Unknown provider: ${provider}`);
  return defaults[kind];
}

/**
 * Get an AI SDK model instance for the chosen provider + model id.
 *
 * Return type is `any` because the AI SDK's model classes have private members
 * that TypeScript refuses to emit in declarations.
 *
 * @param {ProviderName} provider
 * @param {string} apiKey
 * @param {string} modelId
 * @returns {any}
 */
export function getModel(provider, apiKey, modelId) {
  if (!apiKey) throw new Error(`Missing apiKey for provider "${provider}"`);
  switch (provider) {
    case 'gemini':
      return createGoogleGenerativeAI({ apiKey })(modelId);
    case 'openai':
      return createOpenAI({ apiKey })(modelId);
    case 'anthropic':
      return createAnthropic({ apiKey })(modelId);
    case 'groq':
      return createGroq({ apiKey })(modelId);
    case 'openrouter':
      return createOpenRouter({ apiKey })(modelId);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
