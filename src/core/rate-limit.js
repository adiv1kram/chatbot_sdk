/**
 * In-memory rate limiter for the chat handler. Three counters:
 *
 *   - per-session (cap on messages within one conversation)
 *   - per-IP sliding window (cap on messages from one IP over `windowSeconds`)
 *   - daily (total LLM calls across all visitors within one UTC day)
 *
 * State is module-level Maps. Resets on process restart — acceptable for a
 * personal-portfolio chatbot. If you ever need durable counters across
 * multi-instance deploys, plug in a `store` config that mirrors the same
 * shape and proxy reads/writes to Redis/KV/etc.
 */

const DEFAULTS = Object.freeze({
  messagesPerSession: 30,
  perIp: { limit: 20, windowSeconds: 300 },
  dailyCalls: 150,
  warnAtFraction: 0.8,
});

/**
 * @typedef {Object} RateLimitConfig
 * @property {number} [messagesPerSession]
 * @property {{ limit: number, windowSeconds: number }} [perIp]
 * @property {number} [dailyCalls]
 * @property {number} [warnAtFraction] - 0..1; counters above this fraction trigger nearLimit=true.
 *
 * @typedef {Object} RateLimitCheck
 * @property {boolean} allowed - True if all counters are still below limit.
 * @property {boolean} nearLimit - True if any counter is past warnAtFraction.
 * @property {string|null} hitLimit - Which counter (if any) tripped: 'session' | 'ip' | 'daily' | null.
 * @property {number} retryAfter - Seconds the worst-case counter has until reset (for Retry-After header).
 * @property {{ session: number, ip: number, daily: number }} remaining
 */

/**
 * Build a rate limiter. Pass `false` (handled by caller) to skip; pass an
 * empty object to use defaults.
 *
 * @param {RateLimitConfig} [config]
 */
export function createRateLimiter(config = {}) {
  const cfg = mergeConfig(config);
  const sessionCounts = /** @type {Map<string, number>} */ (new Map());
  const ipBuckets = /** @type {Map<string, number[]>} */ (new Map());
  const dailyState = /** @type {{ key: string, count: number }} */ ({ key: '', count: 0 });

  /**
   * Record a successful chat turn (commit-after-success pattern).
   * Call this AFTER the LLM responds to keep failed calls from counting.
   * @param {{ sessionId: string, ip: string }} ids
   */
  function commit({ sessionId, ip }) {
    const now = Date.now();
    sessionCounts.set(sessionId, (sessionCounts.get(sessionId) ?? 0) + 1);
    const bucket = ipBuckets.get(ip) ?? [];
    bucket.push(now);
    ipBuckets.set(ip, bucket);
    rotateDaily(now);
    dailyState.count += 1;
  }

  /**
   * Inspect (and optionally cleanup) counters without committing a new turn.
   * @param {{ sessionId: string, ip: string }} ids
   * @returns {RateLimitCheck}
   */
  function check({ sessionId, ip }) {
    const now = Date.now();
    const sessionCount = sessionCounts.get(sessionId) ?? 0;

    // Trim expired IP timestamps before counting.
    const bucket = ipBuckets.get(ip) ?? [];
    const windowMs = cfg.perIp.windowSeconds * 1000;
    const cutoff = now - windowMs;
    const live = bucket.filter((t) => t > cutoff);
    if (live.length !== bucket.length) ipBuckets.set(ip, live);
    const ipCount = live.length;

    rotateDaily(now);
    const dailyCount = dailyState.count;

    const sessionRemaining = Math.max(0, cfg.messagesPerSession - sessionCount);
    const ipRemaining = Math.max(0, cfg.perIp.limit - ipCount);
    const dailyRemaining = Math.max(0, cfg.dailyCalls - dailyCount);

    let hitLimit = null;
    if (sessionCount >= cfg.messagesPerSession) hitLimit = 'session';
    else if (ipCount >= cfg.perIp.limit) hitLimit = 'ip';
    else if (dailyCount >= cfg.dailyCalls) hitLimit = 'daily';

    const sessionFrac = cfg.messagesPerSession > 0 ? sessionCount / cfg.messagesPerSession : 0;
    const ipFrac = cfg.perIp.limit > 0 ? ipCount / cfg.perIp.limit : 0;
    const dailyFrac = cfg.dailyCalls > 0 ? dailyCount / cfg.dailyCalls : 0;
    const nearLimit =
      sessionFrac >= cfg.warnAtFraction ||
      ipFrac >= cfg.warnAtFraction ||
      dailyFrac >= cfg.warnAtFraction;

    // Retry-After: for IP we know the oldest live timestamp; session resets
    // only when the session is dropped (the visitor opens a new tab) so we
    // use a generic 60s; daily uses time-until-midnight-UTC.
    let retryAfter = 60;
    if (hitLimit === 'ip' && live.length > 0) {
      retryAfter = Math.max(1, Math.ceil((live[0] + windowMs - now) / 1000));
    } else if (hitLimit === 'daily') {
      const next = nextUtcMidnight(now);
      retryAfter = Math.max(60, Math.ceil((next - now) / 1000));
    } else if (hitLimit === 'session') {
      retryAfter = 3600; // session reset is effectively "open a new chat"
    }

    return {
      allowed: hitLimit == null,
      hitLimit,
      nearLimit,
      retryAfter,
      remaining: { session: sessionRemaining, ip: ipRemaining, daily: dailyRemaining },
    };
  }

  /**
   * Read the current resolved config. Useful for unit tests / debug logs.
   */
  function getConfig() {
    return cfg;
  }

  function rotateDaily(now) {
    const key = utcDayKey(now);
    if (dailyState.key !== key) {
      dailyState.key = key;
      dailyState.count = 0;
    }
  }

  return { check, commit, getConfig };
}

/**
 * @param {RateLimitConfig} input
 */
function mergeConfig(input) {
  return {
    messagesPerSession: input.messagesPerSession ?? DEFAULTS.messagesPerSession,
    perIp: {
      limit: input.perIp?.limit ?? DEFAULTS.perIp.limit,
      windowSeconds: input.perIp?.windowSeconds ?? DEFAULTS.perIp.windowSeconds,
    },
    dailyCalls: input.dailyCalls ?? DEFAULTS.dailyCalls,
    warnAtFraction: input.warnAtFraction ?? DEFAULTS.warnAtFraction,
  };
}

function utcDayKey(now) {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function nextUtcMidnight(now) {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

export const RATE_LIMIT_DEFAULTS = DEFAULTS;
