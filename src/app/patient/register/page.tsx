import { SiteHeader } from "@/components/ui/SiteHeader";
import { RegisterForm } from "./RegisterForm";

export default function PatientRegisterPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <RegisterForm />
      </main>
    </>
  );
}
