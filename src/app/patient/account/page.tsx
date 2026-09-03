import Link from "next/link";
import { requirePatientSession } from "@/lib/auth/patient";
import { prisma } from "@/lib/db";
import { patientLogout } from "@/app/patient/actions";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ContactForm } from "./ContactForm";

export default async function PatientAccountPage() {
  const session = await requirePatientSession();
  const [patient, activeTokens, recordCount] = await Promise.all([
    prisma.patient.findUniqueOrThrow({ where: { id: session.patientId } }),
    prisma.token.findMany({
      where: {
        patientId: session.patientId,
        status: { in: ["BOOKED", "CHECKED_IN", "IN_CONSULT"] },
      },
      include: { session: { include: { doctor: true, clinic: true } } },
      orderBy: { issuedAt: "desc" },
    }),
    prisma.consultationRecord.count({ where: { patientId: session.patientId } }),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">Patient Portal</span>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Welcome, {patient.name}
          </h1>
          <p className="text-xs text-muted">Manage your appointments, live queue tokens, and medical records.</p>
        </div>

        {/* Active Appointments / Live Tokens */}
        {activeTokens.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Active OPD Tokens ({activeTokens.length})</h2>
            <ul className="flex flex-col gap-2.5">
              {activeTokens.map((t) => (
                <li key={t.id}>
                  <Link href={`/t/${t.publicId}`} className="block">
                    <Card className="flex items-center justify-between p-4 hover:border-primary/50 transition-colors border-primary/30 bg-primary/5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-foreground tabular-nums">Token #{t.tokenNumber}</span>
                          <span className="text-xs font-semibold text-primary uppercase">
                            {t.status === "IN_CONSULT" ? "Calling You" : t.status === "CHECKED_IN" ? "Checked In" : "Confirmed"}
                          </span>
                        </div>
                        <p className="text-xs text-muted">
                          {t.session.doctor.name} · {t.session.clinic.name}
                        </p>
                      </div>
                      <span className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm">
                        Track Live &rarr;
                      </span>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Quick Nav Cards */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/patient/appointments"
            className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4 hover:border-primary/40 transition-colors"
          >
            <span className="text-2xl">📅</span>
            <span className="text-sm font-bold text-foreground">Appointments</span>
            <span className="text-xs text-muted">View all past &amp; upcoming visits</span>
          </Link>

          <Link
            href="/patient/records"
            className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4 hover:border-primary/40 transition-colors"
          >
            <span className="text-2xl">📋</span>
            <span className="text-sm font-bold text-foreground">Health Locker</span>
            <span className="text-xs text-muted">{recordCount} consultation records</span>
          </Link>
        </div>

        {/* Profile Contact Form */}
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Account Profile</h2>
          <ContactForm name={patient.name} email={patient.email} phone={patient.phone} />
        </div>

        <form action={patientLogout} className="pt-2 border-t border-border">
          <Button type="submit" variant="secondary" className="w-full">
            Sign Out of Patient Account
          </Button>
        </form>
      </main>
      <Footer />
    </>
  );
}
