import Link from "next/link";

// No Footer existed anywhere before this (production UI/UX upgrade,
// step 1). Deliberately links only to routes that actually exist —
// no placeholder Privacy/Terms pages invented just to fill a footer.
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-2">
          <span className="text-base font-semibold tracking-tight text-foreground">ApnaHealth</span>
          <p className="max-w-sm text-sm text-muted">
            Find a verified doctor, book a digital token, and know when to arrive — a calmer way to see a doctor.
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/doctors" className="text-muted transition-colors hover:text-foreground">
            Find a doctor
          </Link>
          <Link href="/patient/login" className="text-muted transition-colors hover:text-foreground">
            Patient login
          </Link>
          <Link href="/patient/register" className="text-muted transition-colors hover:text-foreground">
            Create a patient account
          </Link>
          <Link href="/login" className="text-muted transition-colors hover:text-foreground">
            Staff / clinic sign in
          </Link>
        </nav>

        <p className="text-xs text-muted">© {year} ApnaHealth. A coordination and record-keeping tool — clinical decisions remain with your doctor.</p>
      </div>
    </footer>
  );
}
