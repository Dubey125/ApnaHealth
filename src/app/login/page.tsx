import Link from "next/link";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";
import { Alert } from "@/components/ui/Alert";
import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Sign in — ApnaHealth",
};

// Was "Staff login", reachable only from /get-started, while patients had a
// separate /patient/login. Now the single front door for every account
// kind: patient, doctor, clinic or hospital staff, and the platform review
// team. /patient/login redirects here so existing links keep working.
interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  // Set by the reset flow, which signs the browser out and lands here — so
  // the page has to explain why they are looking at a login box.
  const justReset = params.reset === "1";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-5 px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to ApnaHealth</h1>
          <p className="text-sm text-muted">
            Patients, doctors, clinics and hospitals all sign in here — we&apos;ll take you to the right place.
          </p>
        </div>
        {justReset && <Alert variant="success">Password changed. Sign in with your new password.</Alert>}
        <LoginForm />
        <p className="text-sm text-muted">
          New to ApnaHealth?{" "}
          <Link href="/register" className="font-medium text-primary underline underline-offset-2">
            Create an account
          </Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
