"use client";

// Catches errors thrown by the root layout itself, where app/error.tsx
// can't help (it renders inside that same layout). Must supply its own
// <html>/<body> since it replaces the root layout entirely while active.
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <main style={{ maxWidth: 400, margin: "10vh auto", padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ color: "#555", fontSize: 14 }}>
            We hit a problem loading the app. Please try again, or come back in a few minutes.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ background: "black", color: "white", padding: "8px 16px", borderRadius: 4, marginTop: 12 }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
