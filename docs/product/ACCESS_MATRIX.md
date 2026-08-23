# Access Matrix

| Capability | Patient | Front Desk | Doctor | Owner |
|---|---:|---:|---:|---:|
| Search doctors | ✅ | ✅ | ✅ | ✅ |
| View public doctor profile | ✅ | ✅ | ✅ | ✅ |
| Verify doctor | ❌ | ❌ | ❌ | ✅ |
| Create session | ❌ | ❌ | ✅ own sessions | ✅ |
| Issue walk-in | ❌ | ✅ | optional | ✅ |
| Manage queue | ❌ | ✅ | ✅ own sessions | ✅ |
| View own medical record | ✅ | ❌ | ❌ | ❌ by default |
| View authorized patient record | ❌ | ❌ | ✅ | only if explicitly permitted |
| Create consultation record | ❌ | ❌ | ✅ | ❌ |
| View analytics | ❌ | limited | limited | ✅ |
| View audit logs | ❌ | ❌ | limited | ✅ |

UI visibility is not authorization. Enforce all permissions server-side.

"Create session — Doctor ✅ own sessions" is a deliberate widening of the
original Owner-only rule, so a doctor can manage their own schedule without
routing every change through the clinic owner. The boundary is enforced in
`createSession`: for the DOCTOR role the target doctorId is taken from the
verified session cookie and any submitted `doctorId` field is ignored, so a
doctor cannot schedule onto another doctor's calendar. Owners are unchanged
and may still schedule for any doctor in their clinic.
