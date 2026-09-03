import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/ogImage";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "ApnaHealth — find verified doctors, clinics and hospitals near you";

// The site-wide card, inherited by every page that does not define its own
// (the discovery lists, the marketing page, /register).
export default function Image() {
  return renderOgCard({
    kind: "ApnaHealth",
    title: "Find verified doctors, clinics and hospitals near you",
    subtitle: "Book a digital OPD token",
    location: "Track the live queue from home",
  });
}
