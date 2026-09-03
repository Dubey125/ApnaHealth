import type { ReactNode } from "react";

// A layout that exists only to carry metadata.
//
// /patient/* is one person's own appointments, queue position and health
// records. robots.txt asks crawlers not to fetch the subtree, but robots.txt
// is a request, not a boundary — this is the half that still holds if a
// crawler ignores it, or if someone pastes a URL somewhere public.
//
// It deliberately adds no shell of its own: /patient/login and
// /patient/register are reachable signed out, and the pages underneath
// already render their own SiteHeader. Wrapping them in an authenticated
// chrome here would break both.
export const metadata = { robots: { index: false, follow: false } };

export default function PatientLayout({ children }: { children: ReactNode }) {
  return children;
}
