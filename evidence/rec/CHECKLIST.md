# Recommendation feature checklist

## Functional requirements

| Requirement | Evidence |
|---|---|
| G1 Condition selection | `components/driver/TripRecommendation.tsx`, `data/conditions.json` |
| G2 Ranked recommendations and reasons | `lib/recommend/engine.ts`, same driver component |
| G3 Automatic bed request through holds | `lib/recommend/production.ts`, `lib/services/hold-service.ts`, condition API |
| G4 Hospital response and server timeout | `app/api/hospital/incoming/route.ts`, `app/api/hospital/requests/[id]/respond/route.ts`, `lib/recommend/production.ts` |
| G5 Rejection/timeout reroute | `lib/recommend/production.ts`; engine tests cover seeded feasibility/fuzz cases |
| G6 Operational suggestions and exhaustion fallback | driver and patient components, configured fallback in `lib/recommend/constants.ts`; deployment text needs owner review |
| G7 Shared live state/timeline | recommendation APIs and driver, patient and hospital screens; polling implemented; production DB walkthrough outstanding |
| G8 Driver override | `app/api/trips/[id]/hospital-request/route.ts`, `lib/recommend/engine.ts` |
| G9 Acceptance model and baseline | `sim/train-acceptance.ts`, `lib/recommend/accept-model.ts`, `evidence/rec/accept-test-evaluated.json`, `evidence/rec/recommendation-replay.json` |
| G10 Evidence and limitations | this folder; `docs/REC_ASSUMPTIONS.md`, `docs/REC_UI_AUDIT.md` |

## UI requirements

| Requirement | Evidence/status |
|---|---|
| U1–U4 | `components/driver/TripRecommendation.tsx` |
| U5–U9 | Driver and patient screens; see partial items and caveats in `docs/REC_UI_AUDIT.md` |
| U10 | `components/hospitalStaff/HospitalRequestInbox.tsx` |
| U11 | Existing admissions UI; recommendation-specific accepted ETA list is partial/unverified |
| U12 | Existing `lib/roles.ts`, `lib/role-route.ts` hospital auth reused |
| U13 | `components/patient/PatientSOSStatus.tsx` |
| U14 | Driver recommendation and `/hospital-demo` |
| U15–U16 | `/hospital-demo`, H1–H7 files under `data/scenarios/` |
| U17–U18 | Responsive classes and accessible status labels implemented; manual viewport, keyboard, focus and contrast checks remain outstanding |

## Automated verification

`npm test`: 46 tests / 12 files passed. `npx tsc --noEmit`: passed. `npm run build`: passed. This does not substitute for database-backed authorization, response-timeout integration, two-patient race testing, or browser accessibility review.
