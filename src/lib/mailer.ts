// Outbound email, needed for exactly one thing so far: password reset
// links. Deliberately not an SMTP/nodemailer dependency — CLAUDE.md
// requires approval for new packages, and a transactional email API is a
// single POST, so `fetch` is enough.
//
// Two transports, chosen by configuration alone:
//
//   RESEND_API_KEY set  -> real delivery via https://api.resend.com/emails
//   not set             -> "console" transport
//
// The console transport prints the message in development so the flow is
// testable locally, and in production refuses to pretend: sendMail returns
// { delivered: false }, the caller surfaces an honest "we couldn't send
// that right now" instead of the usual reassuring message, and nothing is
// written to the log. A reset link IS a credential; CLAUDE.md's "no
// sensitive information in logs" applies to it exactly as it does to a
// password.
//
// No `import "server-only"` guard: that package is not installed and
// CLAUDE.md requires approval before adding one. The protection instead is
// that every caller is a "use server" action, and RESEND_API_KEY has no
// NEXT_PUBLIC_ prefix, so it cannot reach a client bundle.

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailResult {
  delivered: boolean;
  /** Set when delivery failed, for the server console — never shown to the visitor. */
  reason?: string;
}

const FROM_FALLBACK = "ApnaHealth <onboarding@resend.dev>";

export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

async function sendViaResend(message: MailMessage): Promise<MailResult> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || FROM_FALLBACK,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!response.ok) {
      // Status only. The body can echo the recipient address back.
      return { delivered: false, reason: `Mail provider returned ${response.status}` };
    }
    return { delivered: true };
  } catch (error) {
    return { delivered: false, reason: error instanceof Error ? error.message : "Mail request failed" };
  }
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  if (isMailConfigured()) {
    return sendViaResend(message);
  }

  if (process.env.NODE_ENV === "production") {
    return { delivered: false, reason: "RESEND_API_KEY is not configured" };
  }

  // Development only, and only ever to the developer's own terminal.
  console.info(`\n--- dev mail ---\nto: ${message.to}\nsubject: ${message.subject}\n\n${message.text}\n--- end ---\n`);
  return { delivered: true };
}
