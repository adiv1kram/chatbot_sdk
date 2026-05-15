export const DEFAULT_LLM_TIMEOUT_MS = 60_000;

/**
 * Run an async operation that takes an AbortSignal, automatically aborting
 * after `ms` milliseconds. Used to bound LLM calls so a hung request can't
 * stall the chat handler.
 *
 * @template T
 * @param {(signal: AbortSignal) => Promise<T>} fn
 * @param {number} [ms]
 * @returns {Promise<T>}
 */
export async function withAbortTimeout(fn, ms = DEFAULT_LLM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
