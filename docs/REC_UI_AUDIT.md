# Hospital recommendation UI audit

Audit at `5b1bca4f8b5a922daa12a9f71825ad73d836c809` before recommendation-specific implementation. “Partial” means the repo has adjacent workflow UI, but not the complete condition-based recommendation feature. Widths and interactive states require browser verification during implementation.

| # | UI element | Where | Check | Existing evidence |
|---|---|---|---|---|
| U1 | Config-driven condition picker | Driver Current Trip | MISSING | `components/driver/LiveSOSRequests.tsx`; no `data/conditions.json` |
| U2 | Decision-support recommendation card | Driver Current Trip | MISSING | `components/driver/LiveSOSRequests.tsx` has SOS destination status, not recommendation reasons |
| U3 | Ranked alternatives and reasoned override | Driver | MISSING | No condition-based alternatives/override UI |
| U4 | Availability, acceptance, simulated experience values | Driver | MISSING | No acceptance-model score UI |
| U5 | Bed-request status at driver and patient | Driver, patient | PARTIAL | `components/driver/LiveSOSRequests.tsx`, `components/patient/PatientSOSStatus.tsx` show current SOS hospital status, without condition recommendation timeline |
| U6 | Reroute banner | Driver, patient | PARTIAL | SOS rejection/reroute messaging exists in the driver component; patient status shows request status only |
| U7 | Map with selected destination updated on reroute | Driver, patient | PARTIAL | `components/common/MapView.tsx` and SOS destination data exist; recommendation-selected destination not connected |
| U8 | Full request and rejection timeline | Driver, patient, hospital | PARTIAL | Trip timestamps and hospital request events exist, but no shared recommendation transition log in all views |
| U9 | Exhaustion fallback and manual hospital list | Driver, patient | MISSING | Existing SOS no-driver fallback does not cover failed hospital requests |
| U10 | Hospital request with condition, urgency, ETA, countdown, accept/reject reason | Hospital user | PARTIAL | `components/hospitalStaff/HospitalRequestInbox.tsx` has polling, ETA and accept/reject; no recommendation-specific response countdown |
| U11 | Accepted arrivals with ETA | Hospital user | PARTIAL | `app/hospital-admin/dashboard.tsx` shows admissions, not an ETA arrival list for recommendations |
| U12 | Hospital role login and route protection | Hospital user | EXISTS | `lib/roles.ts`, `lib/role-route.ts`, `app/hospital-admin/page.tsx`, `components/auth/LoginModal.tsx` |
| U13 | Patient condition, destination, ETA and timeline | Patient | PARTIAL | `components/patient/PatientSOSStatus.tsx` shows hospital request details, but not condition and complete timeline |
| U14 | Simulation / decision-support labels | All | PARTIAL | Demo labeling exists in hospital/demo components; recommendation model labels absent |
| U15 | Acceptance model summary and test metrics | Demo page | MISSING | Existing `/surge-demo` is availability-focused; no acceptance model artifact |
| U16 | Hospital recommendation scenarios page | `/hospital-demo` | MISSING | No `app/hospital-demo/` |
| U17 | Palette, responsive layout, overlap and overflow | All | PARTIAL | Existing app styles use broader palette; no feature-specific view exists to validate |
| U18 | Labels, focus, countdown announcements and contrast | All | PARTIAL | Existing controls have basic labels; countdown/accessibility checks for this feature do not exist |

## Verification status

No visual browser pass has been run at 375px, 768px, or 1280px at audit time. Each newly built feature view must be checked at those sizes and have empty, loading, and error states.
