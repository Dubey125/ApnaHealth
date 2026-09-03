"use server";

import { z } from "zod";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { loadSessionForStaff } from "@/lib/queue/staffSessionAccess";
import { allocateNextTokenNumber } from "@/lib/queue/tokenNumbering";
import { NORMAL_PRIORITY, QUEUE_ORDER_BY, countAhead, priorityToMoveToFront } from "@/lib/queue/ordering";

export interface QueueActionState {
  error?: string;
}

const createBreakSchema = z.object({
  sessionId: z.string().min(1),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  reason: z.string().trim().min(1),
});

// A planned, known-in-advance block of time (e.g. a fixed lunch break) —
// distinct from PAUSED, which handles unplanned interruptions with no
// known end time. See the comment on the SessionBreak model.
export async function createSessionBreak(_prevState: QueueActionState, formData: FormData): Promise<QueueActionState> {
  const parsed = createBreakSchema.safeParse({
    sessionId: formData.get("sessionId"),
    startAt: formData.get("startAt"),
    endAt: formData.get("endAt"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: "Enter a start time, end time and reason for the break." };
  }

  const { clinicSession } = await loadSessionForStaff(parsed.data.sessionId);

  const startAt = new Date(parsed.data.startAt);
  const endAt = new Date(parsed.data.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return { error: "Enter a valid start time and an end time after it." };
  }

  await prisma.sessionBreak.create({
    data: { sessionId: clinicSession.id, startAt, endAt, reason: parsed.data.reason },
  });

  revalidatePath(`/app/queue/${clinicSession.id}`);
  return {};
}

const walkInSchema = z.object({
  sessionId: z.string().min(1),
  patientName: z.string().trim().min(1),
  patientPhone: z.string().trim().min(6),
  // Captured at the counter because a walk-in has no Patient account to
  // read these from. All optional: the front desk should never be blocked
  // from issuing a token because a detail is missing.
  patientAge: z.coerce.number().int().min(0).max(130).optional(),
  patientSex: z.enum(["Female", "Male", "Other"]).optional(),
  reasonForVisit: z.string().trim().min(1).optional(),
  // Optional, like every other detail on this form: the front desk must
  // never be blocked from issuing a token. An unrecorded type falls back
  // to the overall median in the prediction, which is what v0 always did.
  visitType: z.enum(["NEW", "FOLLOW_UP", "PROCEDURE"]).optional(),
});

export async function issueWalkInToken(_prevState: QueueActionState, formData: FormData): Promise<QueueActionState> {
  const parsed = walkInSchema.safeParse({
    sessionId: formData.get("sessionId"),
    patientName: formData.get("patientName"),
    patientPhone: formData.get("patientPhone"),
    patientAge: formData.get("patientAge") || undefined,
    patientSex: formData.get("patientSex") || undefined,
    reasonForVisit: formData.get("reasonForVisit") || undefined,
    visitType: formData.get("visitType") || undefined,
  });
  if (!parsed.success) {
    return { error: "Enter the patient's name and phone number. Age, if given, must be a whole number." };
  }

  const { clinicSession } = await loadSessionForStaff(parsed.data.sessionId);
  if (clinicSession.status !== "OPEN" && clinicSession.status !== "IN_PROGRESS") {
    return { error: "This session is not currently accepting tokens." };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const tokenNumber = await allocateNextTokenNumber(tx, clinicSession.id);
    // Opportunistic link to a Patient account by phone (see Phase 8's
    // medical-record feature) — only connects to an already-registered
    // account, never creates one, so a walk-in never requires a password.
    const existingPatient = await tx.patient.findUnique({ where: { phone: parsed.data.patientPhone } });
    const token = await tx.token.create({
      data: {
        sessionId: clinicSession.id,
        publicId: nanoid(),
        tokenNumber,
        patientId: existingPatient?.id,
        patientNameSnapshot: parsed.data.patientName,
        patientPhoneSnapshot: parsed.data.patientPhone,
        patientAgeSnapshot: parsed.data.patientAge,
        patientSexSnapshot: parsed.data.patientSex,
        reasonForVisit: parsed.data.reasonForVisit,
        visitType: parsed.data.visitType ?? "UNSPECIFIED",
        source: "WALK_IN",
        status: "CHECKED_IN",
        issuedAt: now,
        checkedInAt: now,
      },
    });
    await tx.queueEvent.createMany({
      data: [
        { sessionId: clinicSession.id, tokenId: token.id, type: "TOKEN_ISSUED", occurredAt: now },
        { sessionId: clinicSession.id, tokenId: token.id, type: "CHECKED_IN", occurredAt: now },
      ],
    });
  });

  revalidatePath(`/app/queue/${clinicSession.id}`);
  return {};
}

const tokenActionSchema = z.object({
  sessionId: z.string().min(1),
  tokenId: z.string().min(1),
});

export async function checkInToken(_prevState: QueueActionState, formData: FormData): Promise<QueueActionState> {
  const parsed = tokenActionSchema.safeParse({
    sessionId: formData.get("sessionId"),
    tokenId: formData.get("tokenId"),
  });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  const { clinicSession } = await loadSessionForStaff(parsed.data.sessionId);

  const token = await prisma.token.findUnique({ where: { id: parsed.data.tokenId } });
  if (!token || token.sessionId !== clinicSession.id) {
    return { error: "Token not found for this session." };
  }
  if (token.status !== "BOOKED") {
    return { error: `Cannot check in a token with status ${token.status}.` };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.token.update({ where: { id: token.id }, data: { status: "CHECKED_IN", checkedInAt: now } }),
    prisma.queueEvent.create({
      data: { sessionId: clinicSession.id, tokenId: token.id, type: "CHECKED_IN", occurredAt: now },
    }),
  ]);

  revalidatePath(`/app/queue/${clinicSession.id}`);
  return {};
}

const STAFF_CANCELLABLE_STATUSES = ["BOOKED", "CHECKED_IN"] as const;

export async function markNoShow(_prevState: QueueActionState, formData: FormData): Promise<QueueActionState> {
  const parsed = tokenActionSchema.safeParse({
    sessionId: formData.get("sessionId"),
    tokenId: formData.get("tokenId"),
  });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  const { session, clinicSession } = await loadSessionForStaff(parsed.data.sessionId);

  const token = await prisma.token.findUnique({ where: { id: parsed.data.tokenId } });
  if (!token || token.sessionId !== clinicSession.id) {
    return { error: "Token not found for this session." };
  }
  if (!STAFF_CANCELLABLE_STATUSES.includes(token.status as (typeof STAFF_CANCELLABLE_STATUSES)[number])) {
    return { error: `Cannot mark a token with status ${token.status} as no-show.` };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.token.update({ where: { id: token.id }, data: { status: "NO_SHOW" } }),
    prisma.queueEvent.create({
      data: {
        sessionId: clinicSession.id,
        tokenId: token.id,
        actorStaffUserId: session.staffUserId,
        type: "MARKED_NO_SHOW",
        occurredAt: now,
      },
    }),
  ]);

  revalidatePath(`/app/queue/${clinicSession.id}`);
  return {};
}

export async function cancelTokenByStaff(_prevState: QueueActionState, formData: FormData): Promise<QueueActionState> {
  const parsed = tokenActionSchema.safeParse({
    sessionId: formData.get("sessionId"),
    tokenId: formData.get("tokenId"),
  });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  const { session, clinicSession } = await loadSessionForStaff(parsed.data.sessionId);

  const token = await prisma.token.findUnique({ where: { id: parsed.data.tokenId } });
  if (!token || token.sessionId !== clinicSession.id) {
    return { error: "Token not found for this session." };
  }
  if (!STAFF_CANCELLABLE_STATUSES.includes(token.status as (typeof STAFF_CANCELLABLE_STATUSES)[number])) {
    return { error: `Cannot cancel a token with status ${token.status}.` };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.token.update({ where: { id: token.id }, data: { status: "CANCELLED" } }),
    prisma.queueEvent.create({
      data: {
        sessionId: clinicSession.id,
        tokenId: token.id,
        actorStaffUserId: session.staffUserId,
        type: "CANCELLED",
        occurredAt: now,
      },
    }),
  ]);

  revalidatePath(`/app/queue/${clinicSession.id}`);
  return {};
}

// Reordering the queue.
//
// A human decides, always. Nothing in the product moves a patient forward
// on its own — not the prediction engine, not a rule, not a score. The
// front desk (or the doctor) makes a judgement about the person in front
// of them and the system records it: who, when, why, and the positions
// either side of the change. QUEUE_RULES.md carries the full rule.
//
// A reason is mandatory on the way in, because moving one patient forward
// moves every other patient back, and a queue that can be silently
// reordered is one nobody can be held to.
const prioritiseSchema = z.object({
  sessionId: z.string().min(1),
  tokenId: z.string().min(1),
  reason: z.string().trim().min(3).max(200),
});

/** 1-based position of a token among those waiting, in effective order. */
function positionAmong(target: { queuePriority: number; tokenNumber: number }, queue: { queuePriority: number; tokenNumber: number }[]): number {
  return countAhead(target, queue) + 1;
}

export async function prioritiseToken(_prevState: QueueActionState, formData: FormData): Promise<QueueActionState> {
  const parsed = prioritiseSchema.safeParse({
    sessionId: formData.get("sessionId"),
    tokenId: formData.get("tokenId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: "Give a short reason (at least 3 characters) for moving this patient forward." };
  }

  const { session, clinicSession } = await loadSessionForStaff(parsed.data.sessionId);

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    // Same advisory lock the token numbering and "call next" use. Reading
    // the highest priority and then writing one above it is a
    // read-modify-write, so two devices prioritising at the same instant
    // would otherwise compute the same value and land in an order neither
    // of them chose.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${clinicSession.id}, 0))`;

    const token = await tx.token.findUnique({ where: { id: parsed.data.tokenId } });
    if (!token || token.sessionId !== clinicSession.id) {
      return { error: "Token not found for this session." };
    }
    // Only a checked-in patient can be moved forward, because only a
    // checked-in patient can be called at all. Promising the front desk
    // that they can advance someone who has not arrived would be a
    // promise "call next" cannot keep.
    if (token.status !== "CHECKED_IN") {
      return { error: "Only a checked-in patient who is waiting can be moved forward." };
    }

    const waiting = await tx.token.findMany({
      where: { sessionId: clinicSession.id, status: "CHECKED_IN" },
      select: { id: true, queuePriority: true, tokenNumber: true },
    });

    const fromPosition = positionAmong(token, waiting);
    if (fromPosition === 1) {
      return { error: "This patient is already next to be called." };
    }

    const newPriority = priorityToMoveToFront(waiting);
    await tx.token.update({ where: { id: token.id }, data: { queuePriority: newPriority } });
    await tx.queueEvent.create({
      data: {
        sessionId: clinicSession.id,
        tokenId: token.id,
        actorStaffUserId: session.staffUserId,
        type: "TOKEN_REORDERED",
        occurredAt: now,
        // The append-only record of the decision. Operational text written
        // by staff — it is never shown to patients and never leaves the
        // clinic's own console.
        metadata: {
          reason: parsed.data.reason,
          fromPosition,
          toPosition: 1,
          previousPriority: token.queuePriority,
          newPriority,
        },
      },
    });
    return {};
  });

  revalidatePath(`/app/queue/${clinicSession.id}`);
  return result;
}

const restoreOrderSchema = z.object({
  sessionId: z.string().min(1),
  tokenId: z.string().min(1),
  reason: z.string().trim().max(200).optional(),
});

/**
 * Undo a reorder, returning a token to normal FIFO position.
 *
 * The reason is optional here where it is required on the way in: putting
 * a queue back the way it was is a correction, and a busy counter that
 * has just bumped the wrong patient should be able to fix it in one
 * click. Who did it and when are still recorded.
 */
export async function restoreTokenOrder(_prevState: QueueActionState, formData: FormData): Promise<QueueActionState> {
  const parsed = restoreOrderSchema.safeParse({
    sessionId: formData.get("sessionId"),
    tokenId: formData.get("tokenId"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  const { session, clinicSession } = await loadSessionForStaff(parsed.data.sessionId);

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${clinicSession.id}, 0))`;

    const token = await tx.token.findUnique({ where: { id: parsed.data.tokenId } });
    if (!token || token.sessionId !== clinicSession.id) {
      return { error: "Token not found for this session." };
    }
    if (token.queuePriority === NORMAL_PRIORITY) {
      return { error: "This patient is already in normal queue order." };
    }

    const waiting = await tx.token.findMany({
      where: { sessionId: clinicSession.id, status: "CHECKED_IN" },
      select: { id: true, queuePriority: true, tokenNumber: true },
    });
    const fromPosition = positionAmong(token, waiting);
    const restored = { queuePriority: NORMAL_PRIORITY, tokenNumber: token.tokenNumber };
    const toPosition = positionAmong(
      restored,
      waiting.map((other) => (other.id === token.id ? { ...other, queuePriority: NORMAL_PRIORITY } : other)),
    );

    await tx.token.update({ where: { id: token.id }, data: { queuePriority: NORMAL_PRIORITY } });
    await tx.queueEvent.create({
      data: {
        sessionId: clinicSession.id,
        tokenId: token.id,
        actorStaffUserId: session.staffUserId,
        type: "TOKEN_REORDERED",
        occurredAt: now,
        metadata: {
          reason: parsed.data.reason ?? "Returned to normal queue order",
          fromPosition,
          toPosition,
          previousPriority: token.queuePriority,
          newPriority: NORMAL_PRIORITY,
        },
      },
    });
    return {};
  });

  revalidatePath(`/app/queue/${clinicSession.id}`);
  return result;
}

const doneCallNextSchema = z.object({
  sessionId: z.string().min(1),
});

// The one primary action of the front-desk console. Transactional per
// QUEUE_RULES.md: end the current consult (if any), then start the next
// eligible waiting token (if any) — serialized per-session via the same
// advisory lock used for token numbering, so a second device clicking
// this at the same instant can't race the first.
export async function doneCallNext(_prevState: QueueActionState, formData: FormData): Promise<QueueActionState> {
  const parsed = doneCallNextSchema.safeParse({ sessionId: formData.get("sessionId") });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  const { session, clinicSession } = await loadSessionForStaff(parsed.data.sessionId);
  if (clinicSession.status !== "OPEN" && clinicSession.status !== "IN_PROGRESS") {
    return { error: "This session isn't open for consultations." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${clinicSession.id}, 0))`;
      const now = new Date();

      // Re-checked inside the lock (using this transaction's own `now`) so
      // a break starting the instant this runs can't race past the check.
      const activeBreak = await tx.sessionBreak.findFirst({
        where: { sessionId: clinicSession.id, startAt: { lte: now }, endAt: { gt: now } },
      });
      if (activeBreak) {
        throw new Error(`ON_BREAK:${activeBreak.reason}`);
      }

      // OPEN -> IN_PROGRESS happens implicitly on the first "Done — call
      // next" of the session, since that's the real-world moment the
      // doctor starts seeing patients (see the Phase 5 report's note on
      // this same judgment call for the owner-driven transition).
      if (clinicSession.status === "OPEN") {
        await tx.session.update({
          where: { id: clinicSession.id },
          data: { status: "IN_PROGRESS", actualStartAt: clinicSession.actualStartAt ?? now },
        });
        await tx.queueEvent.create({
          data: {
            sessionId: clinicSession.id,
            actorStaffUserId: session.staffUserId,
            type: "SESSION_OPENED",
            occurredAt: now,
          },
        });
      }

      const current = await tx.token.findFirst({ where: { sessionId: clinicSession.id, status: "IN_CONSULT" } });
      if (current) {
        await tx.token.update({ where: { id: current.id }, data: { status: "COMPLETED", consultEndedAt: now } });
        await tx.queueEvent.create({
          data: {
            sessionId: clinicSession.id,
            tokenId: current.id,
            actorStaffUserId: session.staffUserId,
            type: "CONSULT_ENDED",
            occurredAt: now,
          },
        });
      }

      // Effective queue order, not token order: this is the line that
      // makes a reorder mean anything. Everything else about the feature
      // is presentation.
      const next = await tx.token.findFirst({
        where: { sessionId: clinicSession.id, status: "CHECKED_IN" },
        orderBy: QUEUE_ORDER_BY,
      });
      if (next) {
        await tx.token.update({ where: { id: next.id }, data: { status: "IN_CONSULT", consultStartedAt: now } });
        await tx.queueEvent.create({
          data: {
            sessionId: clinicSession.id,
            tokenId: next.id,
            actorStaffUserId: session.staffUserId,
            type: "CONSULT_STARTED",
            occurredAt: now,
          },
        });
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("ON_BREAK:")) {
      const reason = err.message.slice("ON_BREAK:".length);
      return { error: `The doctor is on a scheduled break (${reason}). Try again after the break ends.` };
    }
    throw err;
  }

  revalidatePath(`/app/queue/${clinicSession.id}`);
  return {};
}
