import Link from "next/link";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";
import { RegisterFacilityForm } from "./RegisterFacilityForm";

export const metadata = {
  title: "Register your clinic or hospital · ApnaHealth",
};

export default function RegisterFacilityPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Register your clinic or hospital</h1>
          <p className="text-base text-muted">
            Set up your facility, add your doctors, and start issuing digital tokens with live queue tracking.
          </p>
        </div>

        <RegisterFacilityForm />

        <p className="text-center text-sm text-muted">
          Already registered?{" "}
          <Link href="/login" className="font-medium text-primary underline underline-offset-2">
            Sign in
          </Link>{" "}
          · Practising independently?{" "}
          <Link href="/register/doctor" className="font-medium text-primary underline underline-offset-2">
            Register as a doctor
          </Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
