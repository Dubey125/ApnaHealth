import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/env";

// What crawlers may and may not touch.
//
// The disallow list is not an access control — every one of these routes is
// independently gated server-side, and robots.txt is a request, not a
// boundary. It exists so that private and pointless URLs stay out of search
// results and out of crawl budget:
//
//   /app, /admin       staff and platform consoles; a login redirect is all
//                      a crawler would ever get
//   /patient           one patient's own appointments and records
//   /t/                live ticket pages. Deliberately unauthenticated so a
//                      walk-in can be handed a link, and deliberately
//                      un-indexed for exactly the same reason — a shared
//                      capability URL must not become a search result.
//                      (The pages carry robots:noindex of their own too.)
//   /api               JSON endpoints; nothing for a crawler to render
//   /book              a booking form, and one that issues a token
//
// /register and its children are deliberately NOT blocked: "list my clinic
// online" is exactly the search a facility owner makes, and those are the
// pages that should answer it.
//
// /login, /forgot-password and /reset-password are also left crawlable, and
// carry robots:noindex instead. A Disallow cannot de-index a page — the
// crawler never fetches it, so it never sees the noindex, and the URL can
// still surface from an external link with no content behind it. Allowing
// the fetch is what makes the noindex bind.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/app/",
          "/admin/",
          "/patient/",
          "/t/",
          "/api/",
          "/book/",
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
