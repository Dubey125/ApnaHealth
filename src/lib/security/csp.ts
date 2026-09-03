// The Content Security Policy, built per request around a nonce.
//
// The previous policy carried `script-src 'unsafe-inline'`, which meant CSP
// was not actually a defence against XSS — an injected <script> would run
// like any other. It bought the other directives (no object embeds, no
// <base> hijacking, no framing) and was honest about that, but the main
// thing a CSP is for was missing.
//
// A nonce fixes it. proxy.ts generates one per request, puts it on the
// request headers so Next stamps its own hydration scripts with it, and
// sends this policy naming it. An injected script has no nonce, so it does
// not run — whatever managed to inject it.
//
// 'strict-dynamic' is what makes that workable in practice: it says
// "scripts loaded BY a trusted script are also trusted", which is how Next
// loads its chunks. Without it every generated chunk URL would need
// enumerating, which is impossible.

/** The one external host the browser talks to: India Post's PIN code API. */
const PINCODE_API = "https://api.postalpincode.in";

/**
 * A fresh nonce per request.
 *
 * Web Crypto rather than node:crypto because this runs in proxy.ts, which
 * must work on the edge runtime as well as Node.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function buildContentSecurityPolicy(nonce: string, isDevelopment = process.env.NODE_ENV === "development"): string {
  const directives = [
    "default-src 'self'",

    // The nonce is what replaced 'unsafe-inline'. 'strict-dynamic' lets
    // Next's bootstrap load its own chunks; browsers that honour it ignore
    // the host-list fallbacks, and older ones fall back to 'self'.
    //
    // 'unsafe-eval' remains in development only — Turbopack's HMR needs it,
    // and it never reaches a built deployment.
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'self'${isDevelopment ? " 'unsafe-eval'" : ""}`,

    // Styles still allow inline, and that is a deliberate, narrower
    // compromise than the script one was. React renders style={{...}} as
    // style ATTRIBUTES, which this app uses heavily for computed positions
    // (the map's tile and pin placement is arithmetic, not classes). A
    // nonce cannot cover an attribute; only 'unsafe-inline' or hashes can,
    // and hashing every computed position is not possible.
    //
    // The exposure is far smaller than inline script: CSS injection can
    // restyle a page, not execute code, and script-src still blocks the
    // scripts an attacker would actually want.
    "style-src 'self' 'unsafe-inline'",

    // https: is deliberately broad — Doctor.photoUrl may point at any https
    // host (lib/images.ts; the server never fetches it, only the viewer's
    // browser does), and map tiles come from a configurable host.
    "img-src 'self' data: https:",

    "font-src 'self' data:",
    `connect-src 'self' ${PINCODE_API}${isDevelopment ? " ws: wss:" : ""}`,

    // No plugin embeds as an injection vector.
    "object-src 'none'",
    // An injected <base> cannot re-point every relative URL on the page.
    "base-uri 'self'",
    // An injected form cannot post credentials to somewhere else.
    "form-action 'self'",
    // No clickjacking of the booking or cancel flows.
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "manifest-src 'self'",
  ];

  if (!isDevelopment) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
