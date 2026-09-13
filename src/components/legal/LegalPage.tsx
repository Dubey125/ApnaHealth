// Shared shell for the legal pages.
//
// Deliberately plain: generous line length, real headings, no marketing
// styling. A terms page that is hard to read is a terms page nobody reads,
// and "they agreed to it" means very little when the text was designed to
// be skipped.

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="text-xs text-muted">Last updated {updated}</p>
        <p className="text-sm leading-relaxed text-muted">{intro}</p>
      </div>
      <div className="flex flex-col gap-6">{children}</div>
    </main>
  );
}
