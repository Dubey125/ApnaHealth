import Link from "next/link";
import { requirePatientSession } from "@/lib/auth/patient";
import { prisma } from "@/lib/db";
import { patientLogout } from "@/app/patient/actions";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Button } from "@/components/ui/Button";
import { ContactForm } from "./ContactForm";

export default async function PatientAccountPage() {
  const session = await requirePatientSession();
  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: session.patientId } });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {patient.name}</h1>
        <ContactForm name={patient.name} email={patient.email} phone={patient.phone} />
        <Link
          href="/patient/appointments"
          className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          My appointments
        </Link>
        <Link
          href="/patient/records"
          className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          My consultation records
        </Link>
        <form action={patientLogout}>
          <Button type="submit" variant="secondary" className="w-full">
            Sign out
          </Button>
        </form>
      </main>
    </>
  );
}
