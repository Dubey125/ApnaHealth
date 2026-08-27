import { redirect } from "next/navigation";

// Patients now sign in through the single /login front door alongside every
// other account kind. Kept as a redirect rather than deleted: this path is
// in the wild (bookmarks, the emailed links, older copies of the footer).
export default function PatientLoginPage() {
  redirect("/login");
}
