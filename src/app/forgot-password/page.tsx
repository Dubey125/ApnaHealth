import Link from "next/link";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata = {
  title: "Forgot password",
  // Crawlable but not indexed — a sign-in form has nothing to offer a
  // search result, and robots.txt deliberately does not block it (see
  // robots.ts: a blocked page cannot be de-indexed).
  robots: { index: false, follow: true },
};

// Serves all three account kinds, like /login does — a patient, a clinic
// owner and an admin all arrive here from the same "Forgot password?" link.
export default function ForgotPasswordPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-5 px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
          <p className="text-sm text-muted">We&apos;ll email you a link to choose a new one.</p>
        </div>
        <ForgotPasswordForm />
        <p className="text-sm text-muted">
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-primary underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
