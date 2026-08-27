import bcrypt from "bcryptjs";
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// Creates (or updates the password of) a platform review-team account.
//
// Deliberately a CLI, not a page: a PlatformAdmin can approve facilities
// and mark doctors verified across every tenant on ApnaHealth, so there
// must be no route on the internet that mints one. Whoever runs this
// already has the database credentials, which is the right bar.
//
//   ADMIN_EMAIL=you@apnahealth.in ADMIN_NAME="Your Name" ADMIN_PASSWORD='...' \
//     npm run admin:create
//
// The password is read from the environment rather than an argument so it
// does not land in shell history or `ps` output.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const MIN_PASSWORD_LENGTH = 12;

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_NAME?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !name || !password) {
    throw new Error(
      "Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD.\n" +
        '  ADMIN_EMAIL=you@apnahealth.in ADMIN_NAME="Your Name" ADMIN_PASSWORD=\'...\' npm run admin:create',
    );
  }
  // Higher than the 8 characters asked of clinics and patients: this
  // account's blast radius is every facility on the platform.
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.platformAdmin.upsert({
    where: { email },
    // Upsert so this doubles as a password reset for an admin who has
    // locked themselves out. It never silently reactivates a disabled
    // account — isActive is left alone on update.
    update: { name, passwordHash },
    create: { email, name, passwordHash },
    select: { id: true, email: true, name: true, isActive: true },
  });

  // No password echoed back.
  console.log(`Platform admin ready: ${admin.name} <${admin.email}>${admin.isActive ? "" : " (DISABLED)"}`);
  console.log("Sign in at /login — the same login box as everyone else.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
