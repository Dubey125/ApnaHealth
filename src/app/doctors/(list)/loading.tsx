// In a (list) route group, not at src/app/doctors/, on purpose.
//
// A loading.tsx applies to its segment AND every child of it, so at
// src/app/doctors/loading.tsx this boundary also wrapped
// /doctors/[slug] — which made that route stream, which committed a 200
// before its notFound() could set a 404. Measured: /doctors/no-such-doctor
// returned 200 while /facilities/no-such-facility (no parent loading.tsx)
// correctly returned 404. See docs/product/LOADING_STATES.md.
//
// The route group keeps the skeleton on the list page and leaves the
// profile route outside the boundary. Parentheses are excluded from the
// URL, so /doctors is unchanged.
import { DiscoverySkeleton } from "@/components/discovery/DiscoverySkeleton";

export default function Loading() {
  return <DiscoverySkeleton />;
}
