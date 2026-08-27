import { redirect } from "next/navigation";

// Split into its two real halves: /login (one box for every role) and
// /register (choose an account type). Kept as a redirect because the
// homepage, the footer and outside links all still point here.
export default function GetStartedPage() {
  redirect("/register");
}
