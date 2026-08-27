import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { slugify } from "../src/lib/slugify";
import { checkSeedTarget } from "../src/lib/seedGuard";

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

function todayAtIST(hour: number, minute: number): Date {
  const now = new Date();
  const utcMinutes = hour * 60 + minute - IST_OFFSET_MINUTES;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, utcMinutes));
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
      addressLine: "12 MG Road",
      areaLabel: "Koregaon Park",
      city: "Pune",
      state: "Maharashtra",
      postalCode: "411001",
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

  const session = await prisma.session.create({
    data: {
      clinicId: clinic.id,
      doctorId: doctor1.id,
      publicId: nanoid(),
      sessionDate: todayAtIST(0, 0),
      plannedStartAt: todayAtIST(10, 0),
      plannedEndAt: todayAtIST(13, 0),
      locationLabel: "Room 1",
      status: "OPEN",
    },
  });

  await prisma.token.createMany({
    data: PATIENTS.map((patient, index) => ({
      sessionId: session.id,
      publicId: nanoid(),
      tokenNumber: index + 1,
      patientNameSnapshot: patient.name,
      patientPhoneSnapshot: patient.phone,
      source: "SELF_BOOK" as const,
      status: "BOOKED" as const,
    })),
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
  console.log("Seeded doctors:", doctor1.name, "(VERIFIED) &", doctor2.name, "(PENDING)");
  console.log("Seeded session:", session.id, "status", session.status);

  const tokens = await prisma.token.findMany({
    where: { sessionId: session.id },
    orderBy: { tokenNumber: "asc" },
  });
  console.log(`\nSeeded ${tokens.length} tokens for session ${session.id}:`);
  console.table(
    tokens.map((t) => ({
      tokenNumber: t.tokenNumber,
      publicId: t.publicId,
      patientNameSnapshot: t.patientNameSnapshot,
      patientPhoneSnapshot: t.patientPhoneSnapshot,
      source: t.source,
      status: t.status,
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

console.log(`Seeding ${target.host} — this deletes and recreates "${SEEDED_CLINIC_NAME}".`);

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
