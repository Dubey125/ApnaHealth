import { headers } from "next/headers";
import type { JsonLd as JsonLdDocument } from "@/lib/seo/structuredData";

// Renders JSON-LD into the page.
//
// Two things this has to get right, and both are silent when wrong.
//
// 1. The `<` escape. JSON.stringify happily produces the sequence
//    `</script>` if any field contains it (a doctor's bio, a facility name
//    typed by whoever registered), which would close this tag early and let
//    the rest be parsed as HTML. Everything here comes from user-editable
//    columns, so that is a live XSS vector, not a theoretical one.
//
// 2. The nonce. `application/ld+json` is a data block the browser never
//    executes — but CSP's script-src governs <script> ELEMENTS, not just
//    executable ones, so under the nonce policy in lib/security/csp.ts an
//    un-nonced block is discarded. The page looks perfect and Google
//    silently stops seeing any structured data, which would quietly undo
//    the whole SEO pass.
function serialize(document: JsonLdDocument | JsonLdDocument[]): string {
  return JSON.stringify(document).replace(/</g, "\\u003c");
}

export async function JsonLd({ data }: { data: JsonLdDocument | JsonLdDocument[] }) {
  // Set by proxy.ts on the request headers, the same value it names in the
  // CSP it sent. Absent only if this ever renders outside the proxy's
  // matcher, in which case there is no policy to satisfy either.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // The content is serialized JSON, not markup, and is escaped above.
      dangerouslySetInnerHTML={{ __html: serialize(data) }}
    />
  );
}
