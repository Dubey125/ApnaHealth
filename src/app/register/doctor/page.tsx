import Link from "next/link";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";
import { RegisterDoctorForm } from "./RegisterDoctorForm";

export const metadata = {
  title: "Register as a doctor",
};

export default function RegisterDoctorPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Register as a doctor</h1>
          <p className="text-base text-muted">
            For independent practitioners. Set up your practice, publish your schedule, and let patients book a
            digital token instead of sitting in your waiting room.
          </p>
        </div>

        <RegisterDoctorForm />

        <p className="text-center text-sm text-muted">
          Part of a larger clinic or hospital?{" "}
          <Link href="/register/clinic" className="font-medium text-primary underline underline-offset-2">
            Register the facility
          </Link>{" "}
          instead, or ask its owner to add you ·{" "}
          <Link href="/login" className="font-medium text-primary underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
