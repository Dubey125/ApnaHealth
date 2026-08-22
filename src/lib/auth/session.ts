import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { getSessionSecret } from "@/lib/env";

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(getSessionSecret());
}

export async function signSession(payload: JWTPayload, expiresIn: string): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecretKey());
}

// Returns null for a missing, expired, malformed or tampered token rather
// than throwing, so callers can treat "not logged in" and "bad token" the
// same way.
export async function verifySession<T extends JWTPayload>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify<T>(token, getSecretKey());
    return payload;
  } catch {
    return null;
  }
}
