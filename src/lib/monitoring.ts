import { extractDigest, isExpectedNextControlFlowDigest, logError, type LogContext } from "./log";

// Getting errors somewhere a human will see them.
//
// Until now an error became a line of JSON on stdout. On Vercel that is
// retained briefly, is not alerted on, and nobody reads it — so the failure
// mode was a clinic telephoning to say the queue console had stopped
// working, which is the worst possible monitoring system.
//
// This forwards errors to a configured HTTP endpoint. Deliberately a
// generic webhook rather than a vendor SDK: CLAUDE.md forbids new
// dependencies without approval, and a JSON POST reaches Slack, Discord, a
// serverless function, or anything that can receive one. Sentry and friends
// remain an option later; this makes the absence of monitoring stop being
// the status quo.
//
// Four rules, all of them about not making an outage worse:
//
//   never throws       a failure to REPORT an error must not become a
//                      second error, so everything is caught and swallowed
//   never blocks       the response does not wait on a third party
//   never floods       a route failing on every request would otherwise
//                      send a webhook per request; identical errors are
//                      collapsed into one report per window
//   never leaks        only the context a caller explicitly passed, same
//                      rule as lib/log.ts. No request bodies, no cookies,
//                      no patient data.

/** Errors that are the same "problem" are reported once per window. */
const DEDUPE_WINDOW_MS = 5 * 60_000;

/** A ceiling on distinct reports per window, so a storm cannot become a flood. */
const MAX_REPORTS_PER_WINDOW = 20;

/** The webhook is given this long before we give up on it. */
const WEBHOOK_TIMEOUT_MS = 3_000;

export interface WindowState {
  windowStartMs: number;
  seen: Map<string, number>;
  sent: number;
}

const state: WindowState = { windowStartMs: 0, seen: new Map(), sent: 0 };

/**
 * Whether this error should be sent, given what has already been sent.
 *
 * Pure but for the state it mutates, and `now` is injectable, so the
 * throttling is testable without waiting five minutes.
 */
export function shouldReport(fingerprint: string, now: number, store: WindowState = state): boolean {
  if (now - store.windowStartMs >= DEDUPE_WINDOW_MS) {
    store.windowStartMs = now;
    store.seen.clear();
    store.sent = 0;
  }
  if (store.seen.has(fingerprint)) {
    store.seen.set(fingerprint, (store.seen.get(fingerprint) ?? 0) + 1);
    return false;
  }
  if (store.sent >= MAX_REPORTS_PER_WINDOW) return false;

  store.seen.set(fingerprint, 1);
  store.sent += 1;
  return true;
}

/**
 * What makes two errors "the same" — hashed.
 *
 * The inputs are the route, the message and the first stack frame. That
 * combination distinguishes the same message thrown from two different
 * places, without treating every retry of one bug as novel (which hashing
 * the whole stack would).
 *
 * It is HASHED because this value goes into the outbound payload, and a raw
 * first frame is an absolute source path. Shipping the server's filesystem
 * layout to a third-party webhook is exactly the leak the "no sensitive
 * information in logs" rule exists to prevent — a test caught this before
 * it shipped.
 *
 * FNV-1a rather than SHA-256 from node:crypto, for two reasons.
 *
 * It has to run in the EDGE runtime: instrumentation.ts's onRequestError is
 * bundled for both runtimes, and node:crypto does not exist on the edge —
 * importing it made the error reporter itself the thing that threw. The
 * build reported this as "Ecmascript file had an error" while still exiting
 * zero, so it would have shipped.
 *
 * And Web Crypto's digest is async, which would push async all the way up
 * through a function whose entire job is to not get in the way.
 *
 * A non-cryptographic hash is the right tool regardless: this needs to tell
 * errors apart, not resist an adversary. Two 32-bit passes with different
 * offsets give 64 bits, ample for grouping.
 */
function fnv1a(input: string, offset: number): number {
  let hash = offset;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    // Math.imul because a 32-bit multiply overflows a double.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function fingerprintError(error: unknown, context?: LogContext): string {
  const message = error instanceof Error ? error.message : String(error);
  const firstFrame = error instanceof Error ? (error.stack?.split("\n")[1]?.trim() ?? "") : "";
  const input = `${context?.path ?? ""}|${message}|${firstFrame}`;
  return (
    fnv1a(input, 0x811c9dc5).toString(16).padStart(8, "0") +
    fnv1a(input, 0x01000193).toString(16).padStart(8, "0")
  );
}

export interface ErrorReport {
  message: string;
  fingerprint: string;
  digest?: string;
  context?: LogContext;
  environment: string;
  occurredAt: string;
}

export function buildReport(error: unknown, context: LogContext | undefined, now: Date): ErrorReport {
  return {
    // The message and a digest — never the stack, and never a raw source
    // path (see fingerprintError). A stack can carry interpolated values
    // from the failing call, and this payload leaves our infrastructure.
    message: error instanceof Error ? error.message : String(error),
    fingerprint: fingerprintError(error, context),
    digest: extractDigest(error),
    context,
    environment: process.env.NODE_ENV ?? "unknown",
    occurredAt: now.toISOString(),
  };
}

async function deliver(report: ErrorReport, url: string): Promise<void> {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
  } catch {
    // Swallowed on purpose. If the monitoring endpoint is down, the console
    // line written by reportError() is still the record, and an exception
    // here would turn one incident into two.
  }
}

/**
 * Log an error and, if a webhook is configured, forward it.
 *
 * Always logs. The console line is the record of last resort and does not
 * depend on any third party being reachable.
 */
export function reportError(error: unknown, context?: LogContext): void {
  const digest = extractDigest(error);
  // redirect() and notFound() are control flow implemented by throwing, and
  // are not incidents — the same exclusion lib/log.ts already applies.
  if (isExpectedNextControlFlowDigest(digest)) return;

  logError(error, context);

  const url = process.env.ERROR_WEBHOOK_URL?.trim();
  if (!url) return;

  const report = buildReport(error, context, new Date());
  if (!shouldReport(report.fingerprint, Date.now())) return;

  // Not awaited: the response must not wait on a third party. void marks
  // that as deliberate rather than a forgotten await.
  void deliver(report, url);
}

/** Test seam — resets the dedupe window between cases. */
export function resetReportingWindow(): void {
  state.windowStartMs = 0;
  state.seen.clear();
  state.sent = 0;
}
