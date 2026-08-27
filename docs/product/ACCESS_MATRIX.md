# Access Matrix

| Capability | Patient | Front Desk | Doctor | Owner | Platform Admin |
|---|---:|---:|---:|---:|---:|
| Search doctors | ✅ | ✅ | ✅ | ✅ | ✅ |
| View public doctor profile | ✅ | ✅ | ✅ | ✅ | ✅ |
| Verify doctor | ❌ | ❌ | ❌ | ❌ (view only) | ✅ |
| Approve / reject a facility listing | ❌ | ❌ | ❌ | ❌ | ✅ |
| Create session | ❌ | ❌ | ✅ own sessions | ✅ | ❌ |
| Issue walk-in | ❌ | ✅ | optional | ✅ | ❌ |
| Manage queue | ❌ | ✅ | ✅ own sessions | ✅ | ❌ |
| View own medical record | ✅ | ❌ | ❌ | ❌ by default | ❌ |
| View authorized patient record | ❌ | ❌ | ✅ | only if explicitly permitted | ❌ |
| Create consultation record | ❌ | ❌ | ✅ | ❌ | ❌ |
| View analytics | ❌ | limited | limited | ✅ | ❌ |
| View audit logs | ❌ | ❌ | limited | ✅ | ❌ |

UI visibility is not authorization. Enforce all permissions server-side.

"Create session — Doctor ✅ own sessions" is a deliberate widening of the
original Owner-only rule, so a doctor can manage their own schedule without
routing every change through the clinic owner. The boundary is enforced in
`createSession`: for the DOCTOR role the target doctorId is taken from the
verified session cookie and any submitted `doctorId` field is ignored, so a
doctor cannot schedule onto another doctor's calendar. Owners are unchanged
and may still schedule for any doctor in their clinic.

## Platform Admin

A `PlatformAdmin` is ApnaHealth's own review team, not a clinic role. It is
a separate table with its own session cookie and its own `/admin` routes,
because `StaffUser.clinicId` is required and every staff query is scoped by
it — adding a tenant-less fourth `StaffRole` would have punched a hole
through the isolation invariant.

Note what the row above says the admin **cannot** do. A platform admin has
no access to consultation records, queues, sessions or analytics for any
clinic. Their reach is exactly the two decisions the platform has to make
about a facility it did not create: is this facility real, and is this
doctor's medical registration genuine. Patient clinical data stays inside
the clinic that authored it, and `PRIVACY_BOUNDARY.md` is unchanged.

"Verify doctor" moved from Owner to Platform Admin. It had to: self-serve
signup means a doctor who registers becomes the OWNER of their own
single-doctor practice, so an Owner-verifies-doctors rule was in practice a
doctor-verifies-themselves rule, which `CLAUDE.md` forbids outright
("verification must never be fabricated or treated as automatic truth").
Owners keep full read access to the verification status and its history for
their own doctors at `/app/doctors/[doctorId]`; they simply cannot set it.

Facility approval gates *discovery*, not the account. A pending facility can
sign in and set up doctors, sessions and staff; it is absent from public
search, public doctor profiles and public booking links until approved. The
filter is defined once in `src/lib/publicListing.ts` and applied by every
public query.