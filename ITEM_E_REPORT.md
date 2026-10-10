# Item E — Location and nearby facilities report

## Changes made

- Removed fixed New Delhi coordinates from the dispatcher driver list, the dispatcher map's development shortcut, hospital detail geolocation fallbacks, and routine driver booking. Hospital directions now use a patient's current or explicitly saved last-known coordinates, and are omitted if the hospital itself has no coordinates.
- Changed nearby registered-hospital and pharmacy lookups to location-bounded MongoDB `$near` queries. GeoJSON is kept in `[longitude, latitude]` order. Added/ensured `2dsphere` indexes for hospitals and pharmacies; retained projected fields and batched capacity/doctor lookups.
- Wired the patient facility search to both `GET /api/hospitals?lat=&lng=&radiusKm=` and the merged nearby-facilities API. The radius starts at 25 km and can be widened to 50 km. The empty message is shown only after loading finishes; while loading the existing delayed list skeleton is used. The panel keeps a clearly labeled last-known coordinate and offers manual city/address search and a retry button when location access fails.
- Added Google Places Nearby Search and Place Details support behind the server-only `GOOGLE_MAPS_API_KEY`. Nearby Places are cached by rounded location cell, facility type, and radius for 10 minutes. If no Google key is configured, the existing OpenStreetMap Overpass lookup remains the fallback. Place phone details are requested only when a user opens the phone control and render as `tel:` links.
- Merged registered hospitals and pharmacies with nearby Places by `placeId` and close coordinates. Registered facilities are labeled “Live data”; demo facilities have a “Demo” badge; unregistered places are grey/unverified and the UI does not attach registered bed/doctor data to them. Added nearby real/demo hospital counts.
- Hospital onboarding now stores the geocoded coordinates in GeoJSON. It uses Google's server-side Geocoding API when the key exists and retains server-side Nominatim geocoding as a fallback. The hospital dashboard warns accounts without an address/location: “Add your address so patients can find you”.
- Replaced fixed-city seed data with a `POST /api/seed?lat=&lng=` flow that requires the existing `Authorization: Bearer $SEED_SECRET` check. It creates nearby demo hospitals, pharmacies, doctors, and bed resources around submitted coordinates and replaces only the generated location-demo batch.
- Added a hospital clinical-doctor manager for add/edit/delete, including name, qualification, specialization, availability, optional phone, and experience. Management uses the hospital's own record and the existing ownership-checked doctor APIs. The public hospital detail response and page show those fields and the required “No doctor information added by this hospital yet” empty state. Removed unsupported “Verified” doctor copy and fabricated fallback phone numbers.
- Driver hospital recommendations now query registered, non-demo hospitals near the actual trip origin using `$near`; unregistered Places stay in the separate “Other nearby” data and do not influence ranking.
- Fixed the MongoDB notification TTL index migration: it now updates the existing index by its actual name or creates it when absent. The prior startup code attempted to `collMod` a nonexistent name and prevented location-query initialization on the configured database.

## New configuration and files

- `.env.example`: added optional `GOOGLE_MAPS_API_KEY` for Google Places and Geocoding. Without it, nearby lookup and onboarding continue via OpenStreetMap; Google-only phone details are unavailable.
- `app/api/places/[placeId]/route.ts`: authenticated, on-demand Place Details phone lookup.
- `app/api/hospital-admin/clinical-doctors/route.ts`: resolves the signed-in hospital's MongoDB id and doctor directory.
- `components/hospitalAdmin/ClinicalDoctorsManager.tsx`: hospital-owned doctor CRUD interface.
- `test/nearby-hospitals.test.mjs`: MongoDB integration coverage for a nearby facility being included and a far-city query excluding it.

## Verification

- `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test test/nearby-hospitals.test.mjs` — passed (1 test). It inserts a temporary registered hospital near New York coordinates, confirms it appears nearby, confirms it does not appear in a Los Angeles query, then deletes it.
- `npx tsc --noEmit` — passed.
- `npm run build` — passed with Next.js 16.3.5.
- Targeted ESLint — zero errors; nine unused-import warnings remain in the existing dispatcher and routine-booking files.
- `git diff --check` — passed.

## Notes

- Google Places is enabled only when the deployment supplies `GOOGLE_MAPS_API_KEY`; the key must be configured for Places search, geocoding, and public-place phone lookup. This environment did not validate a Google key or Google billing/API enablement.
- The location test validates the database geospatial behavior and coordinate order. It does not depend on external Places network responses.
- Performance timing logs already present in the location/geocoding paths remain controlled by `CARELINK_PERF_LOGS`; no before/after latency measurements were collected as part of this Item E implementation.
