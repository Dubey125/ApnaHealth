import { headers } from "next/headers";

// Applies the visitor's saved theme BEFORE the first paint.
//
// Without this there is a flash: the server has no idea what the visitor
// chose (the choice lives in localStorage, which the server cannot read),
// so the page paints in the system theme and then snaps to the chosen one
// once React hydrates. On a dark-mode phone opening a light-mode
// preference that is a white flash in a dark room, which is exactly the
// situation someone chose light mode to avoid.
//
// The only way to avoid it is a synchronous inline script in <head>,
// running before the browser paints anything. Hence the dangerouslySet —
// there is no React-idiomatic alternative that runs early enough.
//
// It carries the CSP nonce, like JsonLd does. Under the nonce policy in
// lib/security/csp.ts an un-nonced inline script is silently discarded,
// which would bring the flash straight back with nothing in the console to
// explain it.
//
// The script itself is deliberately tiny and total: it reads one key,
// writes one attribute, and any failure (private browsing, blocked storage,
// a corrupt value) falls through to the system preference, which is the
// correct default anyway.
const SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}`;

export async function ThemeScript() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
