import Link from "next/link";

interface FooterLink {
  href: string;
  label: string;
}

interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

// Multi-column footer reflecting the four audiences, not just patients.
// Every link is a route that actually exists in this app — no invented
// Privacy/Terms/About/Contact pages. There is genuinely no separate URL
// per staff role (Owner/Doctor/Front Desk all sign in at /login), so the
// Doctors and Clinics columns both point there; the column headings and
// surrounding copy carry the audience distinction instead.
const COLUMNS: FooterColumn[] = [
  {
    heading: "Patients",
    links: [
      { href: "/doctors", label: "Find a doctor" },
      { href: "/patient/login", label: "Patient login" },
      { href: "/patient/register", label: "Create an account" },
    ],
  },
  {
    heading: "Doctors",
    links: [
      { href: "/#for-doctors", label: "For doctors" },
      { href: "/login", label: "Doctor login" },
    ],
  },
  {
    heading: "Clinics",
    links: [
      { href: "/#for-clinics", label: "For clinics" },
      { href: "/login", label: "Clinic / staff login" },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-2">
            <span className="text-base font-semibold tracking-tight text-foreground">ApnaHealth</span>
            <p className="max-w-xs text-sm text-muted">
              Healthcare, connected from discovery to consultation — for patients, doctors, and the clinics that run
              between them.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.heading} className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">{column.heading}</span>
              <nav aria-label={column.heading} className="flex flex-col gap-2">
                {column.links.map((link) => (
                  <Link key={link.label} href={link.href} className="text-sm text-muted transition-colors hover:text-foreground">
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </div>

        <p className="border-t border-border pt-6 text-xs text-muted">
          © {year} ApnaHealth. A coordination and record-keeping tool — clinical decisions remain with your doctor.
        </p>
      </div>
    </footer>
  );
}
