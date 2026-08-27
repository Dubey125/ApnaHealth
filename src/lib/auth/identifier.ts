import { z } from "zod";

// One login box has to accept two different identifiers, because the
// account tables genuinely use different ones: StaffUser and PlatformAdmin
// are keyed by email, Patient by phone (that is what people actually have
// in India, and what patient signup asks for). Rather than making the
// visitor first declare which kind of account they hold — the thing the
// unified login exists to remove — we classify what they typed.

const emailSchema = z.string().email();

export function looksLikeEmail(identifier: string): boolean {
  return emailSchema.safeParse(identifier).success;
}

// Phone numbers are stored exactly as they were typed at signup, so
// "+91 98765 43210", "98765 43210" and "9876543210" may all be the same
// person. Rather than rewriting stored data (a migration that guesses at
// what a number means is worse than none), a login attempt is expanded
// into the small set of spellings it could have been saved as — each one
// still a unique-index lookup, resolved in a single `phone IN (...)` query.
//
// Deliberately conservative: this only reshapes separators and an Indian
// country code, and never invents extra digits.
export function phoneCandidates(identifier: string): string[] {
  const raw = identifier.trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return [];

  const candidates = new Set<string>([raw, digits]);
  // Only two shapes are treated as Indian: a bare 10-digit national number,
  // or that number behind a 91 country code. Anything else keeps just its
  // separator-stripped form — "+1 415 555 0100" is a US number, and taking
  // its last ten digits to build a "+91..." candidate would be a guess that
  // could collide with a real Indian patient's account.
  const national =
    digits.length === 10 ? digits : digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : "";
  if (national.length === 10) {
    candidates.add(national);
    candidates.add(`+91${national}`);
    candidates.add(`+91 ${national}`);
    // The spacing PhoneInput itself produces.
    candidates.add(`+91 ${national.slice(0, 5)} ${national.slice(5)}`);
    candidates.add(`${national.slice(0, 5)} ${national.slice(5)}`);
  }
  return [...candidates];
}
