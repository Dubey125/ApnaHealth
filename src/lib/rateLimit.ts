export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  windowStartMs: number;
}

// Fixed-window counter. Pure and independently testable: the caller
// supplies the bucket store, so a test can assert behavior without
// reaching into module-level state or mocking time via real delays.
export function evaluateRateLimit(
  buckets: Map<string, Bucket>,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): RateLimitResult {
  const existing = buckets.get(key);
  if (!existing || now - existing.windowStartMs >= windowMs) {
    buckets.set(key, { count: 1, windowStartMs: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (existing.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((existing.windowStartMs + windowMs - now) / 1000) };
  }
  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

// In-memory only — correct for a single long-running Node process, but
// each cold-started serverless instance gets its own counter, so this is
// a best-effort speed bump against casual abuse, not a hard multi-instance
// guarantee. No Redis without explicit approval (CLAUDE.md's locked
// stack) — see docs/DEPLOYMENT.md for the tradeoff this implies.
const globalBuckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 10_000;

export function checkRateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): RateLimitResult {
  if (globalBuckets.size >= MAX_TRACKED_KEYS) {
    globalBuckets.clear();
  }
  return evaluateRateLimit(globalBuckets, key, limit, windowMs, now);
}
