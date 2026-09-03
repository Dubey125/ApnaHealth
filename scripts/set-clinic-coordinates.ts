import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { parseCoordinatePairFields } from "../src/lib/geo/formCoordinates";

// Backfills the map location of facilities that pre-date "search near you".
//
// Deliberately a CLI rather than an admin screen. The people who can set a
// facility's coordinates through the product are the facility's own owners
// (Clinic profile → Map location), because they are the ones who know where
// they are. This exists for the one-off backfill of facilities that signed
// up before the field existed, and it is run by whoever already holds the
// database credentials.
//
//   npx tsx scripts/set-clinic-coordinates.ts --list
//   npx tsx scripts/set-clinic-coordinates.ts --missing
//   npx tsx scripts/set-clinic-coordinates.ts --id <clinicId> --lat 18.5362 --lng 73.8939
//   npx tsx scripts/set-clinic-coordinates.ts --id <clinicId> --clear
//
// Coordinates come from whatever source the operator trusts — the facility
// itself, a map lookup done by hand. Nothing here invents a position: there
// is no geocoder in this stack, and a guessed coordinate is worse than a
// missing one, because a missing one is visibly missing.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

interface Args {
  list: boolean;
  missing: boolean;
  clear: boolean;
  id?: string;
  lat?: string;
  lng?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { list: false, missing: false, clear: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--list") {
      args.list = true;
    } else if (flag === "--missing") {
      args.missing = true;
    } else if (flag === "--clear") {
      args.clear = true;
    } else if (flag === "--id") {
      args.id = value;
      index += 1;
    } else if (flag === "--lat") {
      args.lat = value;
      index += 1;
    } else if (flag === "--lng") {
      args.lng = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return args;
}

const USAGE = [
  "Set or clear a facility's map location.",
  "",
  "  --list                       every facility and whether it has coordinates",
  "  --missing                    only facilities with no coordinates",
  "  --id <clinicId> --lat <n> --lng <n>   set them",
  "  --id <clinicId> --clear      remove them",
].join("\n");

async function listFacilities(onlyMissing: boolean): Promise<void> {
  const clinics = await prisma.clinic.findMany({
    where: onlyMissing ? { OR: [{ latitude: null }, { longitude: null }] } : {},
    orderBy: [{ approvalStatus: "asc" }, { city: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
      approvalStatus: true,
      isActive: true,
      latitude: true,
      longitude: true,
    },
  });

  if (clinics.length === 0) {
    console.log(onlyMissing ? "Every facility has a map location." : "No facilities exist yet.");
    return;
  }

  for (const clinic of clinics) {
    const position =
      clinic.latitude !== null && clinic.longitude !== null
        ? `${clinic.latitude}, ${clinic.longitude}`
        : "— no map location —";
    const flags = [clinic.approvalStatus, clinic.isActive ? "active" : "inactive"].join("/");
    console.log(`${clinic.id}  ${clinic.name} (${clinic.city}, ${clinic.state}) [${flags}]  ${position}`);
  }

  // The number that matters operationally: an approved, active facility
  // with no coordinates is invisible to radius search while being fully
  // listed everywhere else, which is the state this script exists to end.
  const listedAndMissing = clinics.filter(
    (clinic) =>
      clinic.approvalStatus === "APPROVED" &&
      clinic.isActive &&
      (clinic.latitude === null || clinic.longitude === null),
  ).length;
  console.log(`\n${clinics.length} facilities listed, ${listedAndMissing} live ones missing a map location.`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.list || args.missing) {
    await listFacilities(args.missing);
    return;
  }

  if (!args.id) {
    console.log(USAGE);
    return;
  }

  const clinic = await prisma.clinic.findUnique({
    where: { id: args.id },
    select: { id: true, name: true, city: true, latitude: true, longitude: true },
  });
  if (!clinic) {
    throw new Error(`No facility with id ${args.id}. Run --list to see them.`);
  }

  // Reuses the exact validator the clinic profile form uses, so the CLI
  // cannot write a pair the product would have rejected.
  const parsed = args.clear
    ? ({ ok: true, coordinates: null } as const)
    : parseCoordinatePairFields(args.lat ?? null, args.lng ?? null);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  if (!args.clear && parsed.coordinates === null) {
    throw new Error("Pass --lat and --lng to set a location, or --clear to remove one.");
  }

  await prisma.$transaction([
    prisma.clinic.update({
      where: { id: clinic.id },
      data: {
        latitude: parsed.coordinates?.latitude ?? null,
        longitude: parsed.coordinates?.longitude ?? null,
      },
    }),
    // actorUserId is null: this was not done by anyone with an account.
    // The row still exists so the facility's own audit trail shows that
    // its listing data changed, and when.
    prisma.auditEvent.create({
      data: {
        clinicId: clinic.id,
        actorUserId: null,
        action: args.clear ? "CLINIC_LOCATION_CLEARED" : "CLINIC_LOCATION_BACKFILLED",
        entityType: "Clinic",
        entityId: clinic.id,
        occurredAt: new Date(),
        metadata: { source: "scripts/set-clinic-coordinates.ts" },
      },
    }),
  ]);

  console.log(
    args.clear
      ? `Cleared the map location for ${clinic.name} (${clinic.city}).`
      : `${clinic.name} (${clinic.city}) is now at ${parsed.coordinates?.latitude}, ${parsed.coordinates?.longitude}.`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
