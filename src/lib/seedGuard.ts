// Fail-closed safety gate for prisma/seed.ts.
//
// The seed is destructive: it deletes a clinic's consultation records,
// consent rows, access events, queue events and tokens before recreating
// them (prisma/seed.ts). docs/DEPLOYMENT.md already said "never run this
// against production", but a sentence in a document is not a control — one
// mistyped DATABASE_URL in a shell is all it takes.
//
// Two independent conditions, because either one alone is unreliable:
//
//   NODE_ENV      is easy to get wrong. It is unset in a plain shell, so a
//                 NODE_ENV-only check would default to "allow" in exactly
//                 the situation where someone is pasting a connection
//                 string by hand.
//   the host      is the thing that actually decides which database gets
//                 wiped, so it is what the operator must name.
//
// Anything not proven safe is refused. There is no "force" flag that skips
// the host check, and no override at all when NODE_ENV is production.

export interface SeedTarget {
  databaseUrl: string | undefined;
  nodeEnv: string | undefined;
  /** SEED_ALLOW_HOST — the operator naming the exact host they intend to wipe. */
  allowHost: string | undefined;
}

export type SeedGuardResult = { allowed: true; host: string } | { allowed: false; reason: string };

// Loopback only. A remote dev database (this project runs on a Neon dev
// branch) is deliberately NOT on this list: it is still a shared server
// someone else may be using, so it has to be named explicitly.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"]);

export function checkSeedTarget({ databaseUrl, nodeEnv, allowHost }: SeedTarget): SeedGuardResult {
  // No override path. A production NODE_ENV means someone is running this
  // in, or against, a deployed environment; there is no legitimate reason
  // to wipe clinical records there.
  if (nodeEnv === "production") {
    return { allowed: false, reason: "NODE_ENV is production. The seed is destructive and never runs in production." };
  }

  if (!databaseUrl) {
    return { allowed: false, reason: "DATABASE_URL is not set, so there is no way to tell which database would be wiped." };
  }

  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    return { allowed: false, reason: "DATABASE_URL could not be parsed, so its host could not be confirmed." };
  }
  if (!host) {
    return { allowed: false, reason: "DATABASE_URL has no host, so its target could not be confirmed." };
  }

  if (LOCAL_HOSTS.has(host)) {
    return { allowed: true, host };
  }

  // Exact match, not a prefix or suffix test: "contains" matching on a
  // hostname is how an allowlist quietly starts accepting
  // dev.example.com.attacker.net.
  if (allowHost && allowHost.trim() === host) {
    return { allowed: true, host };
  }

  return {
    allowed: false,
    // The hostname is echoed (never the user, password or database name)
    // because the operator has to be able to copy it into SEED_ALLOW_HOST,
    // and a hostname is not a credential.
    reason:
      `DATABASE_URL points at the remote host "${host}", which is not a local database. ` +
      `The seed deletes clinical records, so it will not touch a remote database unless you name it explicitly:\n` +
      `  SEED_ALLOW_HOST=${host} npx prisma db seed`,
  };
}
