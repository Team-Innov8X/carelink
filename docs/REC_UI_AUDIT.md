# Hospital recommendation UI audit

Initial audit: baseline commit `5b1bca4f8b5a922daa12a9f71825ad73d836c809`. The following records implementation status after phases 3–6. “Partial” means some requested behavior exists but a stated acceptance item remains incomplete.

| # | UI element | Status | Evidence / remaining check |
|---|---|---|---|
| U1 | Config-driven condition picker | EXISTS | `components/driver/TripRecommendation.tsx`; configured JSON; feature picker shown at eligible trip stages |
| U2 | Decision-support recommendation card | EXISTS | `components/driver/TripRecommendation.tsx`; reasoned top option and ETA |
| U3 | Alternatives and reasoned override | EXISTS | Same component; server rejects infeasible override and requires reason |
| U4 | Model values and simulated experience | EXISTS | Same component; includes probability and simulation labels |
| U5 | Bed-request status line | PARTIAL | Driver and patient read server recommendation status; terminal status update paths need full production walkthrough |
| U6 | Reroute banner | EXISTS | Driver and patient timeline/status; inspect copy and timing during integration walkthrough |
| U7 | Map selected hospital and route after reroute | PARTIAL | SOS destination data is projected; selected destination updates map via callback, but live reroute routing was not browser verified |
| U8 | Shared request timeline | PARTIAL | Server timeline is displayed in views; transition completeness requires DB-backed end-to-end validation |
| U9 | Exhaustion fallback and nearest-hospital manual list | PARTIAL | Patient fallback list exists; driver-side nearest-hospital fallback and regional operational text require review |
| U10 | Hospital alert, countdown, accept/reject reason | EXISTS | `components/hospitalStaff/HospitalRequestInbox.tsx`, `app/api/hospital/incoming/route.ts` |
| U11 | Accepted arrivals with ETA | PARTIAL | Existing hospital admissions list is present; recommendation-specific accepted arrival list was not independently validated |
| U12 | Hospital role login and protection | EXISTS | Existing Better Auth hospital roles and protected hospital admin routes reused |
| U13 | Patient condition, destination, ETA and timeline | EXISTS | `components/patient/PatientSOSStatus.tsx` |
| U14 | Simulation / decision-support labels | EXISTS | Driver recommendation and demo page |
| U15 | Model box and test Brier comparison | EXISTS | `/hospital-demo`, reads frozen model and metrics artifacts |
| U16 | H1–H7 scenario demo | EXISTS | `/hospital-demo`, `data/scenarios/H1.json` through `H7.json` |
| U17 | Palette, responsive layout, overlap and overflow | PARTIAL | Feature pages use declared colors and responsive grid classes; manual browser checks at 375, 768 and 1280 px remain outstanding |
| U18 | Accessible labels, focus and announced countdown | PARTIAL | Labels and live countdown are implemented; keyboard/focus/contrast audit remains outstanding |

Automated build and type-check passed. Browser visual inspection at 375px, 768px and 1280px was not completed in this environment; empty/error states and real database role/timeout flows require a configured demo deployment for end-to-end verification.
