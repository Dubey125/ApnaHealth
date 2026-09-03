import type { NextConfig } from "next";

// Hosts the image optimizer is permitted to fetch from, read from
// IMAGE_HOSTS (comma-separated) so it is a deployment decision rather than
// a code change.
//
// Empty by default, and that default matters: next/image fetches remote
// URLs SERVER-SIDE, so an over-broad pattern here turns a user-supplied
// Doctor.photoUrl into server-side request forgery. This list and the
// validator in src/lib/images.ts read the same variable on purpose — a host
// that cannot be saved cannot be fetched, and vice versa.
const imageHosts = (process.env.IMAGE_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter((host) => host.length > 0);

// The CSP is NOT here: it names a per-request nonce, so it is built in
// proxy.ts (src/lib/security/csp.ts). These are the headers that are the
// same for every response, including static assets the proxy skips.
const securityHeaders = [
  // Belt to CSP's frame-ancestors braces, for anything that predates it.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send the origin cross-site but never the path: a ticket URL is a
  // capability, and leaking /t/<publicId> in a Referer header to Google
  // Maps or WhatsApp would hand it to a third party.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // geolocation stays enabled for this origin — the whole "search near you"
  // feature depends on it — and everything else the app never asks for is
  // denied outright, so a compromised script cannot start asking.
  {
    key: "Permissions-Policy",
    value: [
      "geolocation=(self)",
      "camera=()",
      "microphone=()",
      "payment=()",
      "usb=()",
      "magnetometer=()",
      "accelerometer=()",
      "gyroscope=()",
      "interest-cohort=()",
    ].join(", "),
  },
  // Ignored over plain http, so it is safe in development and correct in
  // production. Two years, subdomains included; preload is deliberately not
  // asserted, since that is a one-way commitment for the whole domain.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: imageHosts.map((hostname) => ({ protocol: "https" as const, hostname })),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
