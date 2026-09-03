import Link from "next/link";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";
import { Alert } from "@/components/ui/Alert";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata = {
  title: "Choose a new password",
  // A reset link must never end up in a search index or a referrer-driven
  // analytics report.
  robots: { index: false, follow: false },
};

interface ResetPasswordPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// The token is deliberately NOT validated here, only carried into the form.
// Checking it on GET would let anyone probe tokens with a browser and read
// the answer off the page; the single check happens in the action, at the
// moment the reset is actually attempted.
export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const raw = params.token;
  const token = Array.isArray(raw) ? raw[0] : raw;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-5 px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
          <p className="text-sm text-muted">You&apos;ll be signed out everywhere in this browser and can sign in again.</p>
        </div>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <Alert variant="warning">
            This link is missing its reset code. Open the link from your email again, or{" "}
            <Link href="/forgot-password" className="font-medium underline underline-offset-2">
              request a new one
            </Link>
            .
          </Alert>
        )}
      </main>
      <Footer />
    </>
  );
}
