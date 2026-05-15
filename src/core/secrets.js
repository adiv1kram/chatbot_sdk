import * as v from 'valibot';

export const PROVIDERS = /** @type {const} */ (['gemini', 'openai', 'anthropic', 'groq', 'openrouter']);

const ProviderEntrySchema = v.object({
  apiKey: v.optional(v.string(), ''),
});

const ProvidersBagSchema = v.object(
  Object.fromEntries(PROVIDERS.map((p) => [p, v.optional(ProviderEntrySchema, { apiKey: '' })]))
);

export const SecretsSchema = v.object({
  defaultProvider: v.optional(v.picklist(PROVIDERS), 'gemini'),
  providers: v.optional(
    ProvidersBagSchema,
    Object.fromEntries(PROVIDERS.map((p) => [p, { apiKey: '' }]))
  ),
});

/**
 * Map of provider → env var that holds its API key when env-fallback is used.
 */
export const PROVIDER_ENV_VAR = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

/**
 * Where the professional should get their API key for each provider — surfaced
 * in the Connections UI as an external link.
 */
export const PROVIDER_KEY_URL = {
  gemini: 'https://aistudio.google.com/apikey',
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  groq: 'https://console.groq.com/keys',
  openrouter: 'https://openrouter.ai/keys',
};

/**
 * @typedef {Object} ProviderEntry
 * @property {string} [apiKey]
 *
 * @typedef {Object} SecretsDoc
 * @property {'gemini'|'openai'|'anthropic'|'groq'|'openrouter'} [defaultProvider]
 * @property {Record<string, ProviderEntry>} [providers]
 */

/**
 * Load + validate secrets from a storage adapter. Empty / missing → defaults.
 *
 * @param {import('./types.js').StorageAdapter} storage
 * @returns {Promise<SecretsDoc>}
 */
export async function loadSecrets(storage) {
  let raw;
  try {
    raw = await storage.read();
  } catch (err) {
    throw new Error(
      `Failed to read secrets storage: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!raw) return v.parse(SecretsSchema, {});
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Stored secrets file is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  return v.parse(SecretsSchema, parsed);
}

/**
 * Validate + persist secrets. Returns the normalized doc.
 *
 * @param {import('./types.js').StorageAdapter} storage
 * @param {unknown} input
 * @returns {Promise<SecretsDoc>}
 */
export async function saveSecrets(storage, input) {
  const doc = v.parse(SecretsSchema, input ?? {});
  await storage.write(JSON.stringify(doc, null, 2));
  return doc;
}

/**
 * Apply a patch (output from the admin UI) to an existing secrets doc.
 * An empty-string apiKey clears the existing one. An omitted apiKey leaves it
 * untouched. defaultProvider is replaced if present.
 *
 * @param {SecretsDoc} existing
 * @param {{ defaultProvider?: string, providers?: Record<string, { apiKey?: string }> }} patch
 * @returns {SecretsDoc}
 */
export function mergeSecretsPatch(existing, patch) {
  const merged = v.parse(SecretsSchema, existing ?? {});
  if (patch?.defaultProvider && PROVIDERS.includes(patch.defaultProvider)) {
    merged.defaultProvider = patch.defaultProvider;
  }
  if (patch?.providers && typeof patch.providers === 'object') {
    for (const provider of PROVIDERS) {
      const incoming = patch.providers[provider];
      if (!incoming) continue;
      if (typeof incoming.apiKey === 'string') {
        merged.providers[provider] = { apiKey: incoming.apiKey };
      }
    }
  }
  return v.parse(SecretsSchema, merged);
}

/**
 * Strip secret values for safe transmission to the browser. Returns a shape
 * the UI can render: which providers are configured, last-4 characters of
 * each set key, and whether the effective key is coming from storage or env.
 *
 * @param {SecretsDoc} doc
 * @returns {{ defaultProvider: string, providers: Record<string, { configured: boolean, last4: string, source: 'storage'|'env'|'none' }> }}
 */
export function maskSecrets(doc) {
  const masked = {};
  for (const provider of PROVIDERS) {
    const stored = doc?.providers?.[provider]?.apiKey || '';
    const env = process.env[PROVIDER_ENV_VAR[provider]] || '';
    const effective = stored || env;
    masked[provider] = {
      configured: !!effective,
      last4: effective ? effective.slice(-4) : '',
      source: stored ? 'storage' : env ? 'env' : 'none',
    };
  }
  return {
    defaultProvider: doc?.defaultProvider || 'gemini',
    providers: masked,
  };
}

/**
 * Resolve the effective API key for a provider, given a loaded secrets doc.
 * Precedence: secrets.json > env var > inline fallback > null.
 *
 * @param {object} args
 * @param {SecretsDoc | null | undefined} args.secrets
 * @param {string} args.provider
 * @param {string} [args.inlineFallback]
 * @returns {string | null}
 */
export function resolveApiKey({ secrets, provider, inlineFallback }) {
  const stored = secrets?.providers?.[provider]?.apiKey || '';
  if (stored) return stored;
  const env = process.env[PROVIDER_ENV_VAR[provider]] || '';
  if (env) return env;
  if (inlineFallback) return inlineFallback;
  return null;
}

/**
 * Resolve the effective default provider. UI override beats the route-file
 * default.
 *
 * @param {object} args
 * @param {SecretsDoc | null | undefined} args.secrets
 * @param {string} [args.fallback]
 * @returns {'gemini'|'openai'|'anthropic'|'groq'|'openrouter'}
 */
export function resolveProvider({ secrets, fallback }) {
  const stored = secrets?.defaultProvider;
  if (stored && PROVIDERS.includes(stored)) return stored;
  if (fallback && PROVIDERS.includes(fallback)) return fallback;
  return 'gemini';
}
