# Access Matrix

| Capability | Patient | Front Desk | Doctor | Owner |
|---|---:|---:|---:|---:|
| Search doctors | ✅ | ✅ | ✅ | ✅ |
| View public doctor profile | ✅ | ✅ | ✅ | ✅ |
| Verify doctor | ❌ | ❌ | ❌ | ✅ |
| Create session | ❌ | ❌ | ❌ | ✅ |
| Issue walk-in | ❌ | ✅ | optional | ✅ |
| Manage queue | ❌ | ✅ | ✅ own sessions | ✅ |
| View own medical record | ✅ | ❌ | ❌ | ❌ by default |
| View authorized patient record | ❌ | ❌ | ✅ | only if explicitly permitted |
| Create consultation record | ❌ | ❌ | ✅ | ❌ |
| View analytics | ❌ | limited | limited | ✅ |
| View audit logs | ❌ | ❌ | limited | ✅ |

UI visibility is not authorization. Enforce all permissions server-side.
