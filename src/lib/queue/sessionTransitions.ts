import type { QueueEventType, SessionStatus } from "@/generated/prisma/enums";

// Locked chain from docs/product/QUEUE_RULES.md:
//   SCHEDULED -> OPEN -> IN_PROGRESS -> CLOSED
//   IN_PROGRESS -> PAUSED -> IN_PROGRESS
// Each step is the ONLY valid next state from that state — no skipping
// (e.g. OPEN can't jump straight to CLOSED).
const VALID_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  SCHEDULED: ["OPEN"],
  OPEN: ["IN_PROGRESS"],
  IN_PROGRESS: ["PAUSED", "CLOSED"],
  PAUSED: ["IN_PROGRESS"],
  CLOSED: [],
};

export function isValidSessionTransition(from: SessionStatus, to: SessionStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

// QueueEventType has no dedicated "session started" entry distinct from
// SESSION_OPENED, so OPEN -> IN_PROGRESS (the doctor actually beginning
// consultations, as opposed to OPEN meaning merely "bookable") reuses
// SESSION_OPENED. PAUSED -> IN_PROGRESS is the one case with its own type,
// SESSION_RESUMED.
export function sessionTransitionEventType(from: SessionStatus, to: SessionStatus): QueueEventType {
  if (to === "OPEN") return "SESSION_OPENED";
  if (to === "IN_PROGRESS" && from === "PAUSED") return "SESSION_RESUMED";
  if (to === "IN_PROGRESS") return "SESSION_OPENED";
  if (to === "PAUSED") return "SESSION_PAUSED";
  if (to === "CLOSED") return "SESSION_CLOSED";
  throw new Error(`No QueueEventType mapping for transition ${from} -> ${to}`);
}
