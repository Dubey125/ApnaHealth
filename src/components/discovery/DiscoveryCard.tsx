import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

// A result card whose whole surface is clickable without the whole card
// being a link.
//
// Every discovery card used to be `<Link className="block h-full">` wrapped
// around its entire contents. Three things were wrong with that:
//
//   * a screen reader announced the card as one enormous link, reading the
//     doctor's name, qualification, clinic, address, fee and next session
//     as the link text;
//   * nothing interactive could go inside — a "Book" button or a link to
//     the facility would have been an anchor nested in an anchor, which is
//     invalid HTML and behaves unpredictably;
//   * text inside it could not be selected or copied.
//
// The fix is the standard overlay pattern: the heading holds the only real
// link, and its ::after is stretched over the card. Anything that needs to
// sit ABOVE that overlay — a second link, a button — goes in `actions`, or
// is marked with the `discovery-card-action` class, which lifts it out of
// the overlay's way.

export function DiscoveryCard({
  href,
  title,
  titleAdornment,
  children,
  footer,
  className,
}: {
  /** Where the card's primary link goes. */
  href: string;
  /** The card's heading — also the accessible name of the only link in it. */
  title: string;
  /** Badges shown beside the heading (verification, facility type). */
  titleAdornment?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "group relative flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-colors",
        "hover:border-primary/40 focus-within:border-primary/60",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-foreground">
          <Link
            href={href}
            // The stretched pseudo-element is what makes the card
            // clickable. focus-visible styling stays on the link itself, so
            // keyboard focus is still visible on the card.
            className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:underline group-hover:text-primary"
          >
            {title}
          </Link>
        </h3>
        {titleAdornment}
      </div>

      {children}

      {footer && <div className="mt-auto border-t border-border pt-3 text-xs">{footer}</div>}
    </article>
  );
}

/**
 * Wrap anything inside a DiscoveryCard that must be clickable in its own
 * right — a link to the facility, a phone number, a Book button. Without
 * this it sits underneath the card's overlay and cannot be reached.
 */
export function CardAction({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("relative z-10", className)}>{children}</span>;
}
