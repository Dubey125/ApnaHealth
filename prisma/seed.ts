import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { slugify } from "../src/lib/slugify";
import { buildClinicSlugBase } from "../src/lib/clinicSlug";
import { checkSeedTarget } from "../src/lib/seedGuard";
import type { SessionStatus, TokenStatus } from "../src/generated/prisma/enums";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Development passwords come from the environment, never from this file.
// They used to be string literals here — which put four working logins into
// a public git repository, one of them (since removed) a platform-wide
// admin. Anything committed is public forever, so the only safe number of
// credentials in source is zero.
//
// Fail-closed: an unset variable stops the seed rather than falling back to
// a default, because a default would be exactly the committed credential
// this change exists to remove. Values are read but never printed.
function requiredSeedPassword(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 8) {
    throw new Error(
      `${name} must be set to at least 8 characters before seeding.
` +
        `  These are local development logins — see .env.example. Never reuse a real password.`,
    );
  }
  return value;
}

const IST_OFFSET_MINUTES = 5 * 60 + 30;
const MINUTE_MS = 60_000;

// A wall-clock time on a day relative to today, in the clinic timezone.
//
// The IST calendar date is read by shifting `now` into IST first: between
// 00:00 and 05:30 IST the UTC date is still yesterday, and reading the UTC
// components directly (as this helper used to) put "today's" sessions on
// the wrong day for anyone seeding late at night.
//
// Date.UTC normalises day overflow, so dayOffset crosses month and year
// boundaries without any arithmetic here.
function istDayAt(dayOffset: number, hour: number, minute: number): Date {
  const istNow = new Date(Date.now() + IST_OFFSET_MINUTES * MINUTE_MS);
  const utcMinutes = hour * 60 + minute - IST_OFFSET_MINUTES;
  return new Date(
    Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() + dayOffset, 0, utcMinutes),
  );
}

function minutesFrom(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * MINUTE_MS);
}

const SEEDED_CLINIC_NAME = "Apna Health Test Clinic";

const PATIENTS = [
  { name: "Ravi Kumar", phone: "9000000001" },
  { name: "Priya Sharma", phone: "9000000002" },
  { name: "Amit Patel", phone: "9000000003" },
  { name: "Sunita Devi", phone: "9000000004" },
  { name: "Vikram Singh", phone: "9000000005" },
  { name: "Anjali Gupta", phone: "9000000006" },
  { name: "Rajesh Yadav", phone: "9000000007" },
  { name: "Neha Verma", phone: "9000000008" },
  { name: "Suresh Reddy", phone: "9000000009" },
  { name: "Kavita Joshi", phone: "9000000010" },
  { name: "Manoj Tiwari", phone: "9000000011" },
  { name: "Pooja Nair", phone: "9000000012" },
];

// The one roster entry that also gets a real login, so the patient-facing
// half of the product (appointments, live queue, ticket pages) has someone
// to be. Chosen from PATIENTS rather than invented alongside it: her
// appointments are then the visits the seeded rota actually gave her, not
// a second set of rows bolted on beside everyone else's.
const DEMO_PATIENT = PATIENTS[5];


// ---------------------------------------------------------------------
// The demo schedule.
//
// Everything below is derived from the moment the seed runs. The previous
// version created exactly one session at a fixed 10:00-13:00 today, which
// had two consequences: a database seeded in the afternoon was already
// showing "No upcoming sessions" before anyone opened it, and a database
// seeded yesterday showed an empty product entirely — no queue, no
// bookable session, no next-available on any discovery card.
//
// A fresh seed now produces, relative to now:
//   * three days of finished sessions, so the prediction baseline has real
//     median service times instead of falling back to the doctor default,
//     and so analytics has something to report;
//   * one session live RIGHT NOW, mid-queue: patients completed, one in
//     consult, several waiting, a break scheduled ahead of it;
//   * open and scheduled sessions for the next five days, so discovery
//     and booking work at any hour of any day.
// ---------------------------------------------------------------------

interface TokenPlan {
  patient: { name: string; phone: string };
  tokenNumber: number;
  status: TokenStatus;
  issuedAt: Date;
  checkedInAt?: Date;
  consultStartedAt?: Date;
  consultEndedAt?: Date;
}

// Consult lengths cycle a fixed pattern rather than random values: a seed
// whose analytics differ on every run is not a fixture, it is a moving
// target. The spread (5-11 min) is what makes a median meaningful.
const CONSULT_MINUTES_PATTERN = [7, 5, 9, 6, 11, 6, 8, 5, 10, 7];

function consultMinutes(index: number): number {
  return CONSULT_MINUTES_PATTERN[index % CONSULT_MINUTES_PATTERN.length];
}

function patientAt(index: number): { name: string; phone: string } {
  return PATIENTS[index % PATIENTS.length];
}

/** A finished clinic: every token consulted and closed, back to back. */
function completedTokenPlans(sessionStart: Date, count: number, offset: number): TokenPlan[] {
  const plans: TokenPlan[] = [];
  let cursor = sessionStart.getTime();
  for (let index = 0; index < count; index += 1) {
    const consultStartedAt = new Date(cursor);
    const consultEndedAt = minutesFrom(consultStartedAt, consultMinutes(offset + index));
    // A minute of turnaround between patients, which is what makes the
    // seeded queue look like a clinic rather than a conveyor belt.
    cursor = consultEndedAt.getTime() + MINUTE_MS;
    plans.push({
      patient: patientAt(offset + index),
      tokenNumber: index + 1,
      status: "COMPLETED",
      issuedAt: minutesFrom(sessionStart, -60),
      checkedInAt: minutesFrom(consultStartedAt, -12),
      consultStartedAt,
      consultEndedAt,
    });
  }
  return plans;
}

/** Tokens booked but not yet arrived, for a session that has not started. */
function bookedTokenPlans(now: Date, count: number, offset: number): TokenPlan[] {
  return Array.from({ length: count }, (_, index) => ({
    patient: patientAt(offset + index),
    tokenNumber: index + 1,
    status: "BOOKED" as TokenStatus,
    issuedAt: minutesFrom(now, -(120 + index * 25)),
  }));
}

/**
 * The live queue: four consulted, one in the room, four waiting inside,
 * three yet to arrive. Anchored to `now` so the "in consult" token really
 * is in consult at the moment the page is opened.
 */
function liveTokenPlans(now: Date, sessionStart: Date): TokenPlan[] {
  const COMPLETED = 4;
  const CHECKED_IN = 4;
  const plans: TokenPlan[] = completedTokenPlans(sessionStart, COMPLETED, 0);

  plans.push({
    patient: patientAt(COMPLETED),
    tokenNumber: COMPLETED + 1,
    status: "IN_CONSULT",
    issuedAt: minutesFrom(sessionStart, -60),
    checkedInAt: minutesFrom(now, -25),
    consultStartedAt: minutesFrom(now, -7),
  });

  for (let index = 0; index < CHECKED_IN; index += 1) {
    plans.push({
      patient: patientAt(COMPLETED + 1 + index),
      tokenNumber: COMPLETED + 2 + index,
      status: "CHECKED_IN",
      issuedAt: minutesFrom(sessionStart, -60),
      checkedInAt: minutesFrom(now, -(40 - index * 9)),
    });
  }

  const stillToArrive = PATIENTS.length - plans.length;
  for (let index = 0; index < stillToArrive; index += 1) {
    plans.push({
      patient: patientAt(COMPLETED + 1 + CHECKED_IN + index),
      tokenNumber: plans.length + 1,
      status: "BOOKED",
      issuedAt: minutesFrom(sessionStart, -(90 + index * 20)),
    });
  }

  return plans;
}

type SeededQueueEventType =
  | "TOKEN_ISSUED"
  | "CHECKED_IN"
  | "CONSULT_STARTED"
  | "CONSULT_ENDED"
  | "SESSION_OPENED"
  | "SESSION_CLOSED";

interface SeedSessionInput {
  clinicId: string;
  doctorId: string;
  actorStaffUserId: string;
  dayOffset: number;
  plannedStartAt: Date;
  plannedEndAt: Date;
  locationLabel: string;
  status: SessionStatus;
  actualStartAt?: Date;
  actualEndAt?: Date;
  tokens?: TokenPlan[];
  breaks?: { startAt: Date; endAt: Date; reason: string }[];
}

/**
 * One session with its tokens, scheduled breaks and queue history.
 *
 * QueueEvent rows are written for every state a token passed through,
 * because the queue log is append-only and is what the doctor console, the
 * audit trail and the analytics report all read. A token sitting at
 * COMPLETED with no CONSULT_STARTED behind it would be a history that
 * never happened.
 */
async function seedSession(input: SeedSessionInput): Promise<{ id: string; publicId: string }> {
  const session = await prisma.session.create({
    data: {
      clinicId: input.clinicId,
      doctorId: input.doctorId,
      publicId: nanoid(),
      sessionDate: istDayAt(input.dayOffset, 0, 0),
      plannedStartAt: input.plannedStartAt,
      plannedEndAt: input.plannedEndAt,
      locationLabel: input.locationLabel,
      status: input.status,
      actualStartAt: input.actualStartAt ?? null,
      actualEndAt: input.actualEndAt ?? null,
    },
    select: { id: true, publicId: true },
  });

  if (input.breaks?.length) {
    await prisma.sessionBreak.createMany({
      data: input.breaks.map((entry) => ({ sessionId: session.id, ...entry })),
    });
  }

  const plans = input.tokens ?? [];
  if (plans.length === 0) {
    return session;
  }

  await prisma.token.createMany({
    data: plans.map((plan) => ({
      sessionId: session.id,
      publicId: nanoid(),
      tokenNumber: plan.tokenNumber,
      patientNameSnapshot: plan.patient.name,
      patientPhoneSnapshot: plan.patient.phone,
      source: "SELF_BOOK" as const,
      status: plan.status,
      issuedAt: plan.issuedAt,
      checkedInAt: plan.checkedInAt ?? null,
      consultStartedAt: plan.consultStartedAt ?? null,
      consultEndedAt: plan.consultEndedAt ?? null,
    })),
  });

  // createMany returns a count, not rows, so the ids come back in one read
  // rather than one create per token.
  const created = await prisma.token.findMany({
    where: { sessionId: session.id },
    select: { id: true, tokenNumber: true },
  });
  const idByNumber = new Map(created.map((token) => [token.tokenNumber, token.id]));

  const events: {
    sessionId: string;
    tokenId: string | null;
    actorStaffUserId: string | null;
    type: SeededQueueEventType;
    occurredAt: Date;
  }[] = [];

  if (input.actualStartAt) {
    events.push({
      sessionId: session.id,
      tokenId: null,
      actorStaffUserId: input.actorStaffUserId,
      type: "SESSION_OPENED",
      occurredAt: input.actualStartAt,
    });
  }

  for (const plan of plans) {
    const tokenId = idByNumber.get(plan.tokenNumber) ?? null;
    // TOKEN_ISSUED has no staff actor: these are self-booked tokens, and
    // attributing them to the front desk would misreport who did what.
    events.push({ sessionId: session.id, tokenId, actorStaffUserId: null, type: "TOKEN_ISSUED", occurredAt: plan.issuedAt });
    if (plan.checkedInAt) {
      events.push({
        sessionId: session.id,
        tokenId,
        actorStaffUserId: input.actorStaffUserId,
        type: "CHECKED_IN",
        occurredAt: plan.checkedInAt,
      });
    }
    if (plan.consultStartedAt) {
      events.push({
        sessionId: session.id,
        tokenId,
        actorStaffUserId: input.actorStaffUserId,
        type: "CONSULT_STARTED",
        occurredAt: plan.consultStartedAt,
      });
    }
    if (plan.consultEndedAt) {
      events.push({
        sessionId: session.id,
        tokenId,
        actorStaffUserId: input.actorStaffUserId,
        type: "CONSULT_ENDED",
        occurredAt: plan.consultEndedAt,
      });
    }
  }

  if (input.actualEndAt) {
    events.push({
      sessionId: session.id,
      tokenId: null,
      actorStaffUserId: input.actorStaffUserId,
      type: "SESSION_CLOSED",
      occurredAt: input.actualEndAt,
    });
  }

  await prisma.queueEvent.createMany({ data: events });
  return session;
}

async function main() {
  // Idempotent: remove any previous run's data for this seed clinic, in
  // child-to-parent order, since everything below Clinic is Restrict (not
  // cascade) by design — see the comment on the Doctor model in
  // schema.prisma.
  const existingClinic = await prisma.clinic.findFirst({ where: { name: SEEDED_CLINIC_NAME } });
  if (existingClinic) {
    const sessions = await prisma.session.findMany({ where: { clinicId: existingClinic.id }, select: { id: true } });
    const sessionIds = sessions.map((s) => s.id);
    const doctors = await prisma.doctor.findMany({ where: { clinicId: existingClinic.id }, select: { id: true } });
    const doctorIds = doctors.map((d) => d.id);
    await prisma.recordAccessEvent.deleteMany({ where: { clinicId: existingClinic.id } });
    await prisma.recordConsent.deleteMany({ where: { clinicId: existingClinic.id } });
    await prisma.consultationRecord.deleteMany({ where: { clinicId: existingClinic.id } });
    await prisma.auditEvent.deleteMany({ where: { clinicId: existingClinic.id } });
    await prisma.predictionSnapshot.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.queueEvent.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.sessionBreak.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.token.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.session.deleteMany({ where: { clinicId: existingClinic.id } });
    await prisma.doctorVerification.deleteMany({ where: { doctorId: { in: doctorIds } } });
    await prisma.clinic.delete({ where: { id: existingClinic.id } });
  }

  const clinic = await prisma.clinic.create({
    data: {
      name: SEEDED_CLINIC_NAME,
      // The seed deletes and recreates its own clinic, so there is never a
      // competing row to collide with — no uniqueness loop needed here.
      slug: buildClinicSlugBase(SEEDED_CLINIC_NAME, "Pune"),
      addressLine: "12 MG Road",
      areaLabel: "Koregaon Park",
      city: "Pune",
      state: "Maharashtra",
      postalCode: "411001",
      // Koregaon Park, Pune. Seeded so "search near you" has something to
      // find on a fresh local database — a facility with no coordinates is
      // listed everywhere except radius search.
      latitude: 18.5362,
      longitude: 73.8939,
      phone: "020-12345678",
      // The seeded clinic is pre-approved so the local app has something
      // visible in patient search on first run. Facilities created through
      // the public /register pages start PENDING and stay out of search
      // until the review team approves them.
      approvalStatus: "APPROVED",
      approvalDecidedAt: new Date(),
    },
  });

  // No PlatformAdmin is created here, deliberately.
  //
  // A PlatformAdmin can approve any facility and mark any doctor verified
  // across every tenant on ApnaHealth — it is the one account whose reach
  // is not bounded by a clinicId. An account with that much power must
  // never come from a script whose contents are public. The only way to
  // create one is `npm run admin:create`, which requires database
  // credentials and reads the password from the environment.

  const owner = await prisma.staffUser.create({
    data: {
      clinicId: clinic.id,
      name: "Meera Iyer",
      email: "owner@apnahealth.test",
      passwordHash: await bcrypt.hash(ownerPassword, 10),
      role: "OWNER",
    },
  });

  const frontDesk = await prisma.staffUser.create({
    data: {
      clinicId: clinic.id,
      name: "Farhan Sheikh",
      email: "frontdesk@apnahealth.test",
      passwordHash: await bcrypt.hash(frontDeskPassword, 10),
      role: "FRONT_DESK",
    },
  });

  const doctor1 = await prisma.doctor.create({
    data: {
      clinicId: clinic.id,
      name: "Dr. Aditi Sharma",
      slug: slugify("Dr. Aditi Sharma"),
      specialty: "General Medicine",
      qualificationText: "MBBS, MD (General Medicine)",
      registrationNumber: "MCI-123456",
      registrationCouncil: "Maharashtra Medical Council",
      experienceYears: 9,
      languagesText: "English, Hindi, Marathi",
      consultationFeeMinor: 50000,
      defaultConsultMinutes: 6,
    },
  });

  const doctor2 = await prisma.doctor.create({
    data: {
      clinicId: clinic.id,
      name: "Dr. Rohan Mehta",
      slug: slugify("Dr. Rohan Mehta"),
      specialty: "Pediatrics",
      qualificationText: "MBBS, DCH",
      registrationNumber: "MCI-654321",
      registrationCouncil: "Maharashtra Medical Council",
      experienceYears: 5,
      languagesText: "English, Hindi",
      consultationFeeMinor: 60000,
      defaultConsultMinutes: 8,
    },
  });

  // doctor1 is seeded VERIFIED (with an audit trail row) so discovery/badge
  // testing has a positive case; doctor2 stays PENDING for the negative case.
  await prisma.doctor.update({
    where: { id: doctor1.id },
    data: {
      verificationStatus: "VERIFIED",
      verifiedAt: new Date(),
      verifiedByStaffUserId: owner.id,
      verificationSource: "Maharashtra Medical Council portal",
    },
  });
  await prisma.doctorVerification.create({
    data: {
      doctorId: doctor1.id,
      checkedByStaffUserId: owner.id,
      status: "VERIFIED",
      registrationNumberChecked: "MCI-123456",
      sourceName: "Maharashtra Medical Council portal",
      checkedAt: new Date(),
    },
  });

  const doctorStaff = await prisma.staffUser.create({
    data: {
      clinicId: clinic.id,
      name: doctor1.name,
      email: "doctor@apnahealth.test",
      passwordHash: await bcrypt.hash(doctorPassword, 10),
      role: "DOCTOR",
      doctorId: doctor1.id,
    },
  });

  const now = new Date();

  // --- History -------------------------------------------------------
  // Three finished days behind us. This is what turns the queue
  // prediction from a guess into a measurement: computeForToken needs 3+
  // completed consults in the session, or 5+ for the doctor across 30
  // days, before it stops falling back to Doctor.defaultConsultMinutes.
  const PAST_DAYS = [-1, -2, -3];
  for (const [index, dayOffset] of PAST_DAYS.entries()) {
    const morningStart = istDayAt(dayOffset, 10, 0);
    await seedSession({
      clinicId: clinic.id,
      doctorId: doctor1.id,
      actorStaffUserId: frontDesk.id,
      dayOffset,
      plannedStartAt: morningStart,
      plannedEndAt: istDayAt(dayOffset, 13, 0),
      locationLabel: "Room 1",
      status: "CLOSED",
      actualStartAt: minutesFrom(morningStart, 4),
      actualEndAt: istDayAt(dayOffset, 12, 40),
      tokens: completedTokenPlans(minutesFrom(morningStart, 4), 8, index * 3),
    });

    // doctor2 runs an evening clinic, and only on two of the three days —
    // a rota with no gaps in it is not a rota anyone would recognise.
    if (dayOffset >= -2) {
      const eveningStart = istDayAt(dayOffset, 17, 0);
      await seedSession({
        clinicId: clinic.id,
        doctorId: doctor2.id,
        actorStaffUserId: frontDesk.id,
        dayOffset,
        plannedStartAt: eveningStart,
        plannedEndAt: istDayAt(dayOffset, 19, 30),
        locationLabel: "Room 2",
        status: "CLOSED",
        actualStartAt: minutesFrom(eveningStart, 6),
        actualEndAt: istDayAt(dayOffset, 19, 10),
        tokens: completedTokenPlans(minutesFrom(eveningStart, 6), 6, 4 + index * 2),
      });
    }
  }

  // --- Live now ------------------------------------------------------
  // Anchored to `now`, not to a wall-clock hour, so the queue is mid-flight
  // whatever time the seed is run: four patients seen, one in the room,
  // four waiting inside, three still to arrive.
  const liveStart = minutesFrom(now, -45);
  const liveSession = await seedSession({
    clinicId: clinic.id,
    doctorId: doctor1.id,
    actorStaffUserId: frontDesk.id,
    dayOffset: 0,
    plannedStartAt: liveStart,
    plannedEndAt: minutesFrom(now, 135),
    locationLabel: "Room 1",
    status: "IN_PROGRESS",
    actualStartAt: liveStart,
    tokens: liveTokenPlans(now, liveStart),
    // A break ahead of the queue, so the prediction engine has something
    // to schedule around and the ticket page has a reason to explain.
    breaks: [{ startAt: minutesFrom(now, 60), endAt: minutesFrom(now, 85), reason: "Tea break" }],
  });

  // --- Bookable and scheduled ahead ----------------------------------
  // Tomorrow is OPEN for both doctors so the public booking flow works
  // from any doctor or facility page; the days after are SCHEDULED, which
  // is what fills "Next available" on discovery cards without implying
  // those slots can be booked yet.
  const tomorrowMorning = istDayAt(1, 10, 0);
  await seedSession({
    clinicId: clinic.id,
    doctorId: doctor1.id,
    actorStaffUserId: frontDesk.id,
    dayOffset: 1,
    plannedStartAt: tomorrowMorning,
    plannedEndAt: istDayAt(1, 13, 0),
    locationLabel: "Room 1",
    status: "OPEN",
    // Offset 4 covers roster entries 4-6, which includes DEMO_PATIENT — the
    // demo login needs a future appointment, not only past ones.
    tokens: bookedTokenPlans(now, 3, 4),
  });

  const tomorrowEvening = istDayAt(1, 17, 0);
  await seedSession({
    clinicId: clinic.id,
    doctorId: doctor2.id,
    actorStaffUserId: frontDesk.id,
    dayOffset: 1,
    plannedStartAt: tomorrowEvening,
    plannedEndAt: istDayAt(1, 19, 30),
    locationLabel: "Room 2",
    status: "OPEN",
    tokens: bookedTokenPlans(now, 2, 7),
  });

  const FUTURE_DAYS = [2, 3, 4, 5];
  for (const dayOffset of FUTURE_DAYS) {
    await seedSession({
      clinicId: clinic.id,
      doctorId: doctor1.id,
      actorStaffUserId: frontDesk.id,
      dayOffset,
      plannedStartAt: istDayAt(dayOffset, 10, 0),
      plannedEndAt: istDayAt(dayOffset, 13, 0),
      locationLabel: "Room 1",
      status: "SCHEDULED",
    });
    if (dayOffset % 2 === 0) {
      await seedSession({
        clinicId: clinic.id,
        doctorId: doctor2.id,
        actorStaffUserId: frontDesk.id,
        dayOffset,
        plannedStartAt: istDayAt(dayOffset, 17, 0),
        plannedEndAt: istDayAt(dayOffset, 19, 30),
        locationLabel: "Room 2",
        status: "SCHEDULED",
      });
    }
  }

  // --- The demo patient login ----------------------------------------
  // Upserted, not created: the seed deletes and recreates the clinic, but a
  // Patient is not clinic-scoped (one account holds tickets and records
  // across facilities), so deleting her would reach outside this seed's
  // blast radius. Upsert also makes a re-run double as a password reset,
  // the same pattern npm run admin:create uses.
  const demoPatient = await prisma.patient.upsert({
    where: { phone: DEMO_PATIENT.phone },
    update: { name: DEMO_PATIENT.name, passwordHash: await bcrypt.hash(patientPassword, 10) },
    create: {
      name: DEMO_PATIENT.name,
      phone: DEMO_PATIENT.phone,
      passwordHash: await bcrypt.hash(patientPassword, 10),
    },
  });

  // Claim the visits the rota already gave her, matched on the phone
  // snapshot. Linking by snapshot rather than assigning ids while building
  // the plans keeps this correct if the rota offsets are ever changed:
  // whichever seats she ended up in are the ones that become her account's
  // history. Scoped to this clinic's sessions so a re-run never reaches
  // into another facility's tokens.
  const linked = await prisma.token.updateMany({
    where: { session: { clinicId: clinic.id }, patientPhoneSnapshot: DEMO_PATIENT.phone },
    data: { patientId: demoPatient.id },
  });

  console.log("Seeded clinic:", clinic.name, clinic.id);
  console.log("Seeded staff logins:");
  // Emails only. The passwords are the ones the operator put in their own
  // environment, so echoing them back would only put them into a terminal
  // scrollback and any CI log for no benefit.
  console.log(`  OWNER      ${owner.email}      (SEED_OWNER_PASSWORD)`);
  console.log(`  FRONT_DESK ${frontDesk.email}  (SEED_FRONT_DESK_PASSWORD)`);
  console.log(`  DOCTOR     ${doctorStaff.email}     (SEED_DOCTOR_PASSWORD)`);
  console.log("  No platform admin is seeded — create one with: npm run admin:create");
  console.log("Seeded patient login:");
  console.log(`  PATIENT    ${demoPatient.phone}  (SEED_PATIENT_PASSWORD) — ${demoPatient.name}`);
  console.log(`             ${linked.count} appointments linked to this account`);
  console.log("Seeded doctors:", doctor1.name, "(VERIFIED) &", doctor2.name, "(PENDING)");

  const [sessionCount, tokenCount, eventCount] = await Promise.all([
    prisma.session.count({ where: { clinicId: clinic.id } }),
    prisma.token.count({ where: { session: { clinicId: clinic.id } } }),
    prisma.queueEvent.count({ where: { session: { clinicId: clinic.id } } }),
  ]);
  console.log(`\nSeeded ${sessionCount} sessions, ${tokenCount} tokens, ${eventCount} queue events.`);

  const liveTokens = await prisma.token.findMany({
    where: { sessionId: liveSession.id },
    orderBy: { tokenNumber: "asc" },
  });
  console.log(`\nLive session ${liveSession.id} (IN_PROGRESS right now) — /book/${liveSession.publicId}`);
  console.table(
    liveTokens.map((t) => ({
      tokenNumber: t.tokenNumber,
      publicId: t.publicId,
      patientNameSnapshot: t.patientNameSnapshot,
      status: t.status,
      ticket: `/t/${t.publicId}`,
    })),
  );
}

// The guard runs BEFORE main(), and before any connection is opened — a
// destructive script must decide whether it is allowed to run at all
// before it does anything at all. Exits non-zero so a CI step or a shell
// `&&` chain stops here rather than continuing as though it had seeded.
const target = checkSeedTarget({
  databaseUrl: process.env.DATABASE_URL,
  nodeEnv: process.env.NODE_ENV,
  allowHost: process.env.SEED_ALLOW_HOST,
});
if (!target.allowed) {
  console.error(`Refusing to seed.
${target.reason}`);
  process.exit(1);
}

// Read here, not inside main(): main() deletes the existing clinic and its
// clinical records before it ever gets to creating staff, so a missing
// SEED_OWNER_PASSWORD discovered halfway through would wipe the database
// and then abort, leaving nothing behind. Every precondition this script
// has is checked before it touches a single row.
const ownerPassword = requiredSeedPassword("SEED_OWNER_PASSWORD");
const frontDeskPassword = requiredSeedPassword("SEED_FRONT_DESK_PASSWORD");
const doctorPassword = requiredSeedPassword("SEED_DOCTOR_PASSWORD");
const patientPassword = requiredSeedPassword("SEED_PATIENT_PASSWORD");

console.log(`Seeding ${target.host} — this deletes and recreates "${SEEDED_CLINIC_NAME}".`);

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
