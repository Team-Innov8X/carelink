# Driver SOS workflow manual QA

This is the two-browser manual checklist for the Driver SOS workflow. The implementation and automated checks are complete; live browser/database scenarios below remain unchecked until run against a development MongoDB with two authenticated accounts.

## Setup

- [ ] Start the app and confirm the development database connection succeeds.
- [ ] Open one browser as a patient and a separate browser/profile as a driver.
- [ ] Use a localhost or HTTPS origin so browser geolocation is available.
- [ ] On the driver, allow location access, go available, and confirm the location indicator changes to sharing.
- [ ] Keep browser clocks intentionally different for the countdown check, then restore them.

## Feature checklist (spec F1–F12)

- [ ] F1: Tap SOS once; verify one request is created and the short undo action cancels it. Double-tap/retry with the same idempotency key and verify one active SOS.
- [ ] F2: With multiple eligible online drivers, verify each receives the 10-second alert on Overview, Requests, and Current Trip tabs, with Accept and Decline.
- [ ] F3: Let the first batch expire/decline; verify the server offers the next round and eventually displays no-driver-found plus configured fallback text.
- [ ] F4: Submit a routine request with editable pickup, destination, urgency, and notes.
- [ ] F5: Verify that request appears in the driver's Requests tab without a manual refresh and has no popup countdown.
- [ ] F6: Accept either request type and verify the driver switches to Current Trip automatically.
- [ ] F7: Verify driver, pickup, hospital destination, route state, distance, and ETA are visible; pan and use Recenter.
- [ ] F8: Move the driver or run `npm run sim-driver`; verify the driver marker and patient panel update, accuracy is represented, and stale age advances when updates stop.
- [ ] F9: Advance through accepted → en route to patient → arrived → picked up → en route to hospital → completed. Verify cancel works in each active stage.
- [ ] F10: Verify patient timeline, driver name/vehicle/contact, map, ETA, last update, and cancel action.
- [ ] F11: Inspect dashboard at 375px, 768px, and 1280px. Check tabs, online/location status, overlays, map, and no horizontal overflow.
- [ ] F12: Verify completed, cancelled, and missed SOS entries and timestamps in Task History.

## Required edge cases (spec 1–12)

- [ ] 1: Have two drivers accept the same offer at nearly the same time; exactly one succeeds and the other sees a taken/expired response.
- [ ] 2: Accept after the server expiry; verify rejection and card removal.
- [ ] 3: Cancel from the patient while the driver's alert is open; verify it closes on the next poll with a message.
- [ ] 4: Double tap SOS and retry after simulating a network failure; verify idempotent single request.
- [ ] 5: Go offline or revoke GPS mid-offer; verify offers expire. During a trip, stop GPS and verify patient stale-location notice.
- [ ] 6: Keep a driver on an active trip; verify the feed does not offer another request.
- [ ] 7: Reload both dashboards and verify state restores from the server.
- [ ] 8: Open the same driver account in two tabs; verify duplicate alert suppression and server-side single acceptance.
- [ ] 9: Change device clock; verify countdown follows server time.
- [ ] 10: Try reading/cancelling another patient's request and changing another driver's trip; verify 403.
- [ ] 11: Deny patient GPS and submit without a pickup address; verify a clear prompt. Enter an address and verify geocoded submission.
- [ ] 12: Decline/ignore all rounds; verify offers progress and patient gets no-driver-found.

## GPS, map, and retention

- [ ] Verify driver watch starts when online and continues during an active trip even though driver availability is false.
- [ ] Verify watch stops after going offline or completing/cancelling the trip.
- [ ] Verify permission-denied shows “blocked”; unavailable/timeout shows an unavailable state.
- [ ] Verify location freshness updates with each fix, while trip-history records only movement above `LOCATION_CHANGE_THRESHOLD_M` after the configured throttle.
- [ ] Verify low-accuracy GPS shows its accuracy circle and suppresses a confident route.
- [ ] Verify route calls respect `ROUTE_REFRESH_SECONDS`, with an early refresh after movement beyond `ROUTE_DEVIATION_M`; failed routing shows “approximate”.
- [ ] Verify the map and SOS modal layer correctly, with the modal always above the map.
- [ ] Confirm `driver_location_pings.at` has the TTL index using `LOCATION_RETENTION_DAYS`.

## Simulator

1. Start the app locally and sign in as a driver; go available or accept a trip.
2. Copy the local driver's session cookie into the process environment without committing it.
3. Run `SIM_DRIVER_COOKIE='<session-cookie>' npm run sim-driver` (PowerShell: `$env:SIM_DRIVER_COOKIE='<session-cookie>'; npm run sim-driver`).
4. The script posts a short path to the local `/api/driver/location` route; it refuses non-localhost hosts and production mode. Optional settings: `SIM_DRIVER_BASE_URL`, `SIM_DRIVER_LAT`, `SIM_DRIVER_LNG`, `SIM_DRIVER_STEPS`, `SIM_DRIVER_INTERVAL_MS`.
