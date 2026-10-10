# Item A — Loading speed and skeletons

## Work completed

- Added separate shimmer placeholders for signup forms, dashboards, nearby hospital lists, patient request cards, and the hospital request table. Existing `loading.tsx` files use the matching route skeleton; the dispatcher route now has its own loading file.
- Added a 150 ms display threshold to skeletons. Requests that finish sooner never show the placeholder. Emergency and hospital results keep a loading state until their first fetch completes, and render an empty state only after a successful empty response.
- Removed the initial client-only blank-screen gate from `ClientApp`, allowing the dashboard shell to render immediately and letting its first data fetch proceed in parallel.
- Removed the extra `getSession()` call after password sign-in. Navigation now uses the role in Better Auth’s sign-in response. Google sign-in/signup already supplied a direct callback URL; added timing around the OAuth handoff request.
- Confirmed `session.cookieCache` is enabled in Better Auth (300 seconds). Made the Mongo client a cached global singleton in both development and production runtimes.
- Reused one in-flight `/api/sos` fetch among the dashboard request card, floating SOS status, and request history to avoid duplicate initial authentication/database reads.
- Made the nearby hospitals query run concurrently with OpenStreetMap Overpass requests. Replaced per-hospital bed and doctor queries with one batched resource query and one grouped doctor query, and projected only fields used by the results.
- Separated the SOS route’s hospital-request index from notification-index setup, created an index on `hospitalAdmissionRequests.sosRequestId`, and projected the linked request fields needed by the patient UI.
- Added opt-in timings for session lookup, SOS queries, nearby-facility Mongo queries, Overpass/Nominatim calls, password sign-in, and Google OAuth setup. Enable them with `CARELINK_PERF_LOGS=1` and `NEXT_PUBLIC_CARELINK_PERF_LOGS=1`.
- Added the `/api/notifications/read-all` route referenced by the notification UI; this also fixed a stale generated route type that initially blocked type checking.

## Before/after comparison

The original behavior was not benchmarked before edits, so the table uses reproducible request/query counts rather than claiming an unmeasured time improvement.

| Path | Before | After |
|---|---:|---:|
| Patient dashboard initial SOS fetches | 2 overlapping `/api/sos` requests | 1 shared in-flight request |
| Nearby facilities DB reads for N nearby hospitals | 1 hospital read + 2N per-hospital reads + 1 pharmacy read | 1 hospital read + 1 batched resource read + 1 grouped doctor read + 1 pharmacy read |
| First SOS request index work | SOS indexes plus unrelated notification indexes | SOS and hospital-request indexes only; both collection setups start in parallel |
| Password sign-in after successful auth response | Sign-in request + separate session lookup | Sign-in request only |

Local production-server samples after the changes (7 requests each):

- `/patient-dashboard`: first request 230.4 ms; median of the six warm requests 10.5 ms.
- Unauthenticated `/api/sos`: first request 599.3 ms; median of the six warm requests 6.4 ms. This exercises only the unauthenticated path and does **not** include SOS database queries.
- Session lookup log: 11.76 ms on first request; 0.33–0.50 ms on the six warm requests.

These local measurements do not establish the authenticated dashboard or emergency-tab targets. No authenticated browser session was available to the local production server during measurement, so the newly added logs should be used with a valid session to capture `sos_get` and nearby database timings. The Atlas and Vercel regions could not be compared from this checkout; there is no checked-in Vercel region configuration, and I did not inspect or expose `.env` secrets.

## Files changed for Item A

- `components/common/Skeletons.tsx`, `index.css`, and route loading files under `app/`: route-specific, delayed shimmer skeletons.
- `components/patient/PatientHomeRequestBox.tsx`, `components/patient/PatientEmergencyRequestsView.tsx`, `components/hospitalStaff/HospitalRequestInbox.tsx`, `components/hospitals/NearbyFacilitiesPanel.tsx`, `components/sos/PatientSOSStatus.tsx`, `lib/client-sos.ts`: correct loading states and shared SOS fetch.
- `app/client-app.tsx`, `app/signin/page.tsx`, `components/auth/SignupForm.tsx`: remove blocking render/session work and add sign-in timings.
- `lib/mongodb.ts`, `lib/auth-utils.ts`, `lib/sos.ts`, `lib/places.ts`, `app/api/sos/route.ts`, `app/api/nearby-facilities/route.ts`: connection reuse, indexes, reduced queries, and timings.
- `.env.example`: performance logging flags.
- `app/api/notifications/read-all/route.ts`: supporting missing endpoint required by the current notification UI and build route manifest.
- Small type-only fixes in the in-progress hospital, onboarding, preferences, and triage files were needed for a clean project type check.

## Database/deployment notes

- No data migration is needed. MongoDB creates the `hospitalAdmissionRequests.sosRequestId` index when the SOS route first uses it. Existing SOS indexes remain in place.
- Map code already loads Leaflet dynamically from the map component; no Google Maps JavaScript bundle is loaded on non-map pages.
- Configure both timing flags only when collecting diagnostics. OAuth timings cover the request that starts the redirect, not the third-party Google consent/return time.

## Validation

- `npx tsc --noEmit` — passed.
- `npm run build` — passed on Next.js 16.3.5.
- No separate test suite was run for this loading/performance change.
