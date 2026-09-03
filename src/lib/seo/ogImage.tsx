import { ImageResponse } from "next/og";
import type { ReactElement } from "react";

// Social cards, generated per page.
//
// Every doctor and facility link shared on WhatsApp — which is how this
// product will actually spread in India — currently previews as a bare URL
// with no image, because there are no photos to point at and no storage to
// put one in. These are drawn from the data we already hold, at request
// time, by next/og. No image files, no storage bucket, no new dependency.
//
// Deliberately typographic rather than photographic: a stock photo of a
// generic doctor next to a real doctor's name would be fabricating content
// that isn't real (CLAUDE.md), and it is exactly the kind of thing that
// reads as trustworthy while being untrue.

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

// Inline hex rather than the CSS custom properties the app uses: Satori
// (what next/og renders with) resolves no stylesheet and no var().
const INK = "#0f172a";
const MUTED = "#64748b";
const BRAND = "#0d9488";
const SURFACE = "#ffffff";
const EDGE = "#e2e8f0";

export interface OgCardProps {
  /** Small label above the name: "Doctor", "Hospital", "Clinic". */
  kind: string;
  title: string;
  subtitle?: string | null;
  /** Where it is: "Koregaon Park, Pune". */
  location?: string | null;
  /** Up to three short facts shown along the bottom. */
  facts?: string[];
}

function Card({ kind, title, subtitle, location, facts = [] }: OgCardProps): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: SURFACE,
        padding: 72,
        // A brand-coloured edge, so the card is recognisable at thumbnail
        // size where the text is unreadable.
        borderLeft: `24px solid ${BRAND}`,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 26, color: BRAND, letterSpacing: 2, textTransform: "uppercase" }}>
          {kind}
        </div>
        <div style={{ display: "flex", fontSize: 68, fontWeight: 700, color: INK, marginTop: 16, lineHeight: 1.15 }}>
          {title}
        </div>
        {subtitle ? (
          <div style={{ display: "flex", fontSize: 38, color: BRAND, marginTop: 12 }}>{subtitle}</div>
        ) : null}
        {location ? (
          <div style={{ display: "flex", fontSize: 30, color: MUTED, marginTop: 12 }}>{location}</div>
        ) : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {facts.length > 0 ? (
          <div style={{ display: "flex", gap: 20, marginBottom: 24 }}>
            {facts.slice(0, 3).map((fact) => (
              <div
                key={fact}
                style={{
                  display: "flex",
                  fontSize: 26,
                  color: MUTED,
                  border: `2px solid ${EDGE}`,
                  borderRadius: 999,
                  padding: "10px 22px",
                }}
              >
                {fact}
              </div>
            ))}
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: INK }}>ApnaHealth</div>
          <div style={{ display: "flex", fontSize: 26, color: MUTED }}>Book a digital OPD token</div>
        </div>
      </div>
    </div>
  );
}

export function renderOgCard(props: OgCardProps): ImageResponse {
  return new ImageResponse(<Card {...props} />, OG_SIZE);
}
