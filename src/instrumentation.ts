import type { Instrumentation } from "next";

// Fail fast at server boot: a misconfigured DATABASE_URL/SESSION_SECRET
// should stop the process here, not surface as a confusing error deep
// inside whichever request happens to need it first.
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { validateEnv } = await import("@/lib/env");
  validateEnv();
}

// Centralized server-side error logging for uncaught exceptions across
// Server Components, Route Handlers, Server Actions and proxy — see
// lib/log.ts for what "safe" means here (no request bodies, cookies, or
// headers; expected redirect()/notFound() control flow is filtered out).
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { logError } = await import("@/lib/log");
  logError(error, { path: request.path, method: request.method, routeType: context.routeType });
};
