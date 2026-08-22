export type LogContext = Record<string, string | number | boolean | undefined>;

// Single-line JSON, safe for log aggregators. Only ever includes what a
// caller explicitly passes in `context` — never a raw request/response
// object, headers, or cookies — so a call site can't accidentally leak a
// session token or PII into logs (CLAUDE.md: "No sensitive information in
// logs"). `now` is injectable for deterministic testing.
export function formatLogEntry(
  level: "info" | "error",
  message: string,
  context?: LogContext,
  now: Date = new Date(),
): string {
  return JSON.stringify({ level, message, time: now.toISOString(), ...context });
}

// Next.js attaches a `digest` to errors it generates internally (redirect,
// notFound, and to opaque-ify Server Component errors before they reach
// the client) — surfacing it lets a real log aggregator correlate a
// logged error with what the client actually saw.
export function extractDigest(error: unknown): string | undefined {
  if (error && typeof error === "object" && "digest" in error) {
    return String((error as { digest?: unknown }).digest);
  }
  return undefined;
}

// redirect()/notFound() are normal control flow implemented via throw —
// not failures — so they're excluded from error-level logging to keep
// the log meaningful (a wall of "errors" for every ordinary redirect
// would bury real ones).
export function isExpectedNextControlFlowDigest(digest: string | undefined): boolean {
  return !!digest && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"));
}

export function logInfo(message: string, context?: LogContext): void {
  console.log(formatLogEntry("info", message, context));
}

export function logError(error: unknown, context?: LogContext): void {
  const message = error instanceof Error ? error.message : String(error);
  const digest = extractDigest(error);
  if (isExpectedNextControlFlowDigest(digest)) return;
  console.error(formatLogEntry("error", message, { ...context, digest }));
}
