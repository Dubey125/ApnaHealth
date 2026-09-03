// Validation for Doctor.photoUrl, the one user-supplied URL this app
// renders.
//
// The previous validator was `z.string().trim().url()`, which accepts far
// more than a photo. Measured against it:
//
//     true   https://cdn.example.com/a.jpg
//     true   javascript:alert(1)
//     true   file:///etc/passwd
//     true   http://169.254.169.254/latest/meta-data/
//
// In a plain <img src> most of those are inert, which is why nothing had
// gone wrong yet. But the value also flows into the JSON-LD `image` field
// added for SEO, and the moment anything renders it through next/image the
// optimizer fetches the URL *server-side* — turning that last line into a
// live SSRF against the cloud instance-metadata endpoint.
//
// So: https only, no private or loopback hosts, and an optional host
// allowlist for the ones we are willing to let the image optimizer fetch.

/**
 * Hosts whose images may be fetched and optimized server-side, from
 * IMAGE_HOSTS (comma-separated). Empty by default: this app has no image
 * storage of its own yet, so there is no host it can vouch for, and
 * guessing one on the operator's behalf would be inventing trust.
 */
export function allowedImageHosts(): string[] {
  return (process.env.IMAGE_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host.length > 0);
}

// Hostnames that must never be fetched: they resolve inside the network the
// server is running in. 169.254.169.254 is the cloud instance-metadata
// endpoint — the canonical SSRF target, and the one that leaks credentials.
const BLOCKED_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /\.localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  // Any bracketed IPv6 literal. A photo is never legitimately addressed
  // this way, and enumerating the private ranges of IPv6 is a losing game.
  /^\[/,
];

function isBlockedHostname(hostname: string): boolean {
  return BLOCKED_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname));
}

export type PhotoUrlResult = { ok: true; url: string | null } | { ok: false; error: string };

/**
 * Validate a submitted photo URL.
 *
 * Returns `url: null` for a blank field — "no photo" is a valid state, and
 * clearing the box is how a doctor removes one.
 */
export function parsePhotoUrl(raw: FormDataEntryValue | string | null | undefined): PhotoUrlResult {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed.length === 0) return { ok: true, url: null };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Enter a full image address starting with https://, or leave it blank." };
  }

  // https only. http would also downgrade the page to mixed content and be
  // blocked by the browser anyway, so accepting it only produces a photo
  // that silently never appears.
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "The photo address must start with https:// so browsers will load it." };
  }

  if (isBlockedHostname(parsed.hostname)) {
    return { ok: false, error: "That address points inside a private network and can't be used." };
  }

  const allowed = allowedImageHosts();
  if (allowed.length > 0 && !allowed.includes(parsed.hostname.toLowerCase())) {
    return {
      ok: false,
      error: `Photos must be hosted on: ${allowed.join(", ")}.`,
    };
  }

  return { ok: true, url: parsed.toString() };
}

/**
 * Whether a stored URL is safe to render at all.
 *
 * Applied at render time as well as on write, because rows predate the
 * validation above: a photoUrl saved before this existed could be anything,
 * and a page must degrade to initials rather than emit it.
 */
export function isRenderablePhotoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !isBlockedHostname(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Whether the image optimizer may fetch this URL server-side.
 *
 * Strictly narrower than isRenderablePhotoUrl: rendering an external image
 * in an <img> costs the viewer a request to a third party, which is a
 * privacy question. Having the SERVER fetch it is an SSRF question, and
 * only the configured allowlist answers that one.
 */
export function isOptimizableImageUrl(url: string | null | undefined): boolean {
  if (!isRenderablePhotoUrl(url)) return false;
  const allowed = allowedImageHosts();
  if (allowed.length === 0) return false;
  return allowed.includes(new URL(url as string).hostname.toLowerCase());
}
