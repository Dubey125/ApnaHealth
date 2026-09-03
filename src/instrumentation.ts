import type { Instrumentation } from "next";

// Fail fast at server boot: a misconfigured DATABASE_URL/SESSION_SECRET
// should stop the process here, not surface as a confusing error deep
// inside whichever request happens to need it first.
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { validateEnv, productionConfigWarnings } = await import("@/lib/env");
  validateEnv();

  // Loud about configuration that is wrong rather than missing. These do
  // not stop the boot — an unset SITE_URL is an SEO problem, not a reason
  // to take a clinic offline — but they are otherwise entirely silent.
  const warnings = productionConfigWarnings();
  if (warnings.length > 0) {
    const { logInfo } = await import("@/lib/log");
    for (const warning of warnings) logInfo(`Configuration warning: ${warning}`);
  }
}

// Centralized server-side error logging for uncaught exceptions across
// Server Components, Route Handlers, Server Actions and proxy — see
// lib/log.ts for what "safe" means here (no request bodies, cookies, or
// headers; expected redirect()/notFound() control flow is filtered out).
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // reportError logs exactly as before, and additionally forwards to
  // ERROR_WEBHOOK_URL when one is configured — throttled, never blocking,
  // and carrying no stack or request body. See lib/monitoring.ts.
  const { reportError } = await import("@/lib/monitoring");
  reportError(error, { path: request.path, method: request.method, routeType: context.routeType });
};
