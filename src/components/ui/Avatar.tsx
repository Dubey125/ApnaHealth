import Image from "next/image";
import { isOptimizableImageUrl, isRenderablePhotoUrl } from "@/lib/images";
import { cn } from "./cn";

function initials(name: string): string {
  const parts = name
    .replace(/^Dr\.?\s*/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

// A doctor's photo, in one of three forms.
//
// next/image is used only for hosts on the IMAGE_HOSTS allowlist, because
// the optimizer fetches the URL SERVER-SIDE — pointing it at an arbitrary
// user-supplied address is server-side request forgery, not a performance
// choice. Everything else that is still safe to show falls back to a plain
// <img>, hardened:
//
//   referrerPolicy="no-referrer"  the third party learns the viewer's IP
//                                 either way, but not which doctor they
//                                 were looking at
//   loading="lazy"                an off-screen card should not cost a
//                                 request to someone else's server
//   decoding="async"              keeps a slow image off the main thread
//
// Anything that fails isRenderablePhotoUrl — a legacy row saved before
// lib/images.ts existed, holding javascript: or an internal address —
// degrades to initials rather than being emitted.
//
// The fallback is always initials, never a stock placeholder face
// (CLAUDE.md: don't fabricate content that isn't real). Showing a generic
// photograph where a real doctor's should be is worse than showing none.
export function Avatar({
  name,
  photoUrl,
  size = 48,
  className,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const shared = cn("rounded-full border border-border object-cover", className);

  if (photoUrl && isOptimizableImageUrl(photoUrl)) {
    return (
      <Image
        src={photoUrl}
        alt={`Photo of ${name}`}
        width={size}
        height={size}
        className={shared}
        style={{ width: size, height: size }}
      />
    );
  }

  if (photoUrl && isRenderablePhotoUrl(photoUrl)) {
    return (
      /* Deliberately not next/image: that would make the SERVER fetch this
         arbitrary user-supplied URL. Optimization is not worth an SSRF —
         see lib/images.ts. */
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={`Photo of ${name}`}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className={shared}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn("flex items-center justify-center rounded-full bg-primary/10 font-semibold text-primary", className)}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(name) || "?"}
    </div>
  );
}
