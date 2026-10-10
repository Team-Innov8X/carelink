# CareLink Patient Dashboard — Bug Fixes and Improvements

## Objective

Fix the listed bugs and incomplete features in the CareLink patient dashboard and related pages. Inspect the existing project before changing anything, follow its current architecture and design system, and make the fixes work end-to-end rather than hiding errors with UI-only changes.

## Important implementation rules

1. **Inspect before editing.** Identify the framework, routes, components, API/backend endpoints, authentication flow, state management, map library, and existing styling conventions.
2. **Trace each issue to its root cause.** Do not add duplicate components or replace working architecture unnecessarily.
3. **Preserve existing features and design.** Keep the current CareLink look and feel, responsive layout, and established naming conventions unless a change is required to fix a bug.
4. **Connect the UI to real data.** Do not use hard-coded or mock data as a substitute for patient orders, emergency requests, driver details, notifications, or bed availability.
5. **Handle errors safely.** Show useful, user-friendly error and loading states; never expose stack traces, secrets, or raw server error pages to patients.
6. **Respect authentication and authorization.** Fix forbidden responses by correcting the intended authenticated API flow and permissions. Do not bypass access controls or weaken authorization.
7. **Avoid regressions.** Check existing routes, related dashboard pages, and responsive behavior after changes.
8. **Keep code maintainable.** Reuse shared components and utilities where appropriate. Remove debugging logs and temporary workarounds.
9. **Do not assume the cause.** Reproduce each issue, inspect network requests and console/server logs, and document the actual root cause and fix.
10. **Do not stop at a plan.** Implement the changes, run available tests/build/lint checks, and report what was changed and what could not be verified.

---

## 1. Fix calling/contacting the pharmacy

**Problem:** The patient cannot call/contact the pharmacy from the pharmacy page. Clicking the action opens a dialog/window displaying **“Forbidden.”**

**Requirements:**
- Trace the pharmacy contact action from the UI through the API/backend and any external calling/contact integration.
- Inspect the failed network request, response status, request headers, authentication/session, endpoint, and authorization rules.
- Correct the intended route, credentials/session forwarding, CORS configuration if relevant, and server permissions as appropriate. Do not disable authentication or grant broad access to make the error disappear.
- If the action uses a `tel:` link, verify the phone number is valid and the link is formed correctly. If it uses a backend endpoint or calling provider, handle that provider’s expected response correctly.
- Replace raw “Forbidden” browser dialogs/pages with an accessible, user-friendly message when an action genuinely cannot be completed.
- Show loading, success, and failure feedback where appropriate.
- Verify that an authorized patient can contact the correct pharmacy and that unauthorized requests remain protected.

**Acceptance criteria:**
- The pharmacy contact action works for an authorized user.
- No raw “Forbidden” page/dialog is shown during normal use.
- Authentication and authorization remain enforced.

## 2. Keep the sidebar fixed while the page scrolls

**Problem:** The sidebar containing options such as Dashboard, Hospitals, and Pharmacy scrolls down with the content on the right.

**Requirements:**
- Make the dashboard sidebar remain fixed/sticky in the intended viewport area while the main content scrolls independently.
- Inspect the existing page shell and CSS before choosing `position: fixed`, `position: sticky`, or a flex/grid layout solution.
- Ensure the sidebar height fits the viewport and its own menu can scroll if necessary.
- Account for the header/top bar, if present, so the sidebar does not overlap it.
- Preserve responsive behavior: on smaller screens, use the existing mobile navigation pattern (for example, a drawer) rather than forcing a desktop fixed sidebar.
- Prevent horizontal overflow and avoid content being hidden behind the sidebar.

**Acceptance criteria:**
- Scrolling the main content does not move the desktop sidebar.
- All sidebar links remain visible/usable.
- Mobile/tablet layouts remain usable.

## 3. Remove unwanted text-cursor behavior on clickable controls

**Problem:** Clicking many options causes a text insertion cursor to appear over the option, as if the text were editable/selectable.

**Requirements:**
- Inspect interactive elements and CSS to identify why the text cursor (`I-beam`) appears.
- Use semantic controls: `<button>` for actions and `<a>` for navigation. Do not use editable elements for non-editable labels.
- Apply `cursor: pointer` to clickable controls and navigation links, and `cursor: default` where appropriate for non-interactive labels.
- Where appropriate, use `user-select: none` on controls/icons to avoid accidental text selection, but do not disable text selection globally or on content users may need to copy.
- Preserve visible keyboard-focus styles and keyboard accessibility. Do not remove outlines without an accessible replacement.

**Acceptance criteria:**
- Interactive options display the expected pointer cursor.
- Clicking controls does not leave an unwanted text-selection caret.
- Controls still work with mouse, keyboard, and assistive technology.

## 4. Fix the emergency SOS banner lifecycle and interaction

**Problem:** Once the emergency SOS banner appears, it never disappears and has no close option. Clicking it should open the related emergency/driver details.

**Requirements:**
- Automatically dismiss the transient SOS banner approximately **6–7 seconds** after it appears.
- Add a visible close (`×`) button so the user can dismiss it immediately.
- The close button must have an accessible label such as `Dismiss emergency notification` and must not trigger the banner’s main click action.
- Make the banner itself clickable (or provide a clearly visible “View details” action) to navigate to the correct emergency request/trip details.
- On the destination view, show the matching request’s real status and related details, including assigned driver information when available. If a driver has not yet been assigned, show a clear pending state instead of fabricated information.
- Keep critical emergency information accessible: automatic dismissal must not cancel the emergency request or delete its data. The user must still be able to find the request and its details from the relevant dashboard/history.
- Prevent duplicate banners/timers when state updates or components re-render. Clean up timers on unmount and when the notification changes.
- Make the banner responsive and accessible, with appropriate live-region/announcement behavior that does not repeatedly interrupt the user.

**Acceptance criteria:**
- The banner auto-dismisses after 6–7 seconds and can also be closed manually.
- Clicking the banner/details action opens the correct emergency/trip.
- Real driver details appear when assigned; a clear pending state appears otherwise.
- Dismissing the banner does not cancel the request.

## 5. Fix the notifications JSON parsing error

**Problem:** The Notifications section shows **“Failed to execute json on Response.”**

**Requirements:**
- Trace the notification request and inspect the actual response status, content type, and response body.
- Check whether the server returns HTML (such as a login/error page), an empty body, malformed JSON, or a JSON shape different from what the frontend expects.
- Correct the API/backend response so successful requests return valid JSON with the expected schema and appropriate `Content-Type: application/json` header.
- Handle non-2xx responses before attempting to parse JSON. Do not blindly call `response.json()` on HTML, empty responses, or other incompatible bodies.
- Parse the response body only once. Handle empty responses where appropriate and provide a useful fallback error message without exposing raw HTML/server internals.
- Handle loading, empty-notifications, successful-results, and failure states.
- Ensure authentication/session expiration is handled appropriately and does not surface as a JSON parsing error.

**Acceptance criteria:**
- Notifications load correctly when the endpoint succeeds.
- Empty notification lists show a proper empty state.
- API failures show a useful message, not “Failed to execute json on Response.”
- Invalid or unauthorized requests are handled without crashing the section.

## 6. Show ordered medicines and enable pharmacy contact from Orders

**Problem:** Ordered medicines do not appear in the Orders section, and patients cannot contact the pharmacy.

**Requirements:**
- Trace how medicine orders are created, persisted, fetched, and associated with the authenticated patient.
- Fix any mismatch in API route, patient ID, order ID, database query, response schema, frontend state, or status filtering that prevents orders from appearing.
- Display the real medicine orders belonging to the current patient. Include the available relevant fields, such as order ID, medicines/items, quantity, order date, pharmacy, order status, and delivery/pickup details where supported by the existing data model.
- Do not show another patient’s orders or leak sensitive information.
- Add or repair a pharmacy contact action for each applicable order, using the correct pharmacy associated with that order.
- Reuse the working pharmacy contact flow after fixing item 1 rather than implementing a separate inconsistent flow.
- Include loading, empty, error, and retry states.
- Refresh order status after meaningful actions or use the project’s existing data-refresh strategy.

**Acceptance criteria:**
- Existing orders for the logged-in patient appear with correct details and status.
- A patient with no orders sees a clear empty state.
- Pharmacy contact works for the appropriate order/pharmacy.
- Patient data remains properly isolated.

## 7. Fix continuously reloading Emergency Requests and update requests in real time

**Problem:** Emergency Requests continuously reload, and requests made by the user are not reliably shown in real time.

**Requirements:**
- Identify the cause of repeated fetching/rendering. Check effects and dependency arrays, state updates that retrigger effects, polling intervals, subscriptions, route changes, and React Strict Mode behavior.
- Stop uncontrolled/infinite refetch loops. Do not disable necessary updates as a workaround.
- Use the project’s established real-time mechanism if available (for example, WebSocket, Socket.IO, server-sent events, or a query/cache library). If no real-time mechanism exists, implement a suitable, bounded refresh strategy consistent with the backend architecture.
- Show emergency requests created by the authenticated user as soon as the backend confirms creation. Ensure the new request is reflected in the list without requiring a full-page reload.
- Update request status and assigned-driver details when the backend reports changes.
- Prevent duplicate requests/list entries when an event and a refresh return the same request.
- Clean up timers, subscriptions, and event listeners on component unmount.
- Include loading, empty, and recoverable error states; do not reset the entire page on every refresh.
- Keep the list stable while updates arrive, preserving useful scroll position and user context.

**Acceptance criteria:**
- Emergency Requests does not continuously reload or flicker.
- A user-created request appears promptly and only once.
- Status and driver changes update promptly using the available backend capabilities.
- No leaked timers/subscriptions or repeated network requests remain.

## 8. Repair the map rendering

**Problem:** The map appears broken into pieces/tiles and is not displayed properly.

**Requirements:**
- Identify the map library/provider and reproduce the issue at desktop and mobile sizes.
- Inspect console errors, failed tile/network requests, API key/configuration, provider restrictions, CSS, container dimensions, and initialization timing.
- Fix the actual cause. Check for conflicting global CSS affecting map tiles, images, transforms, positioning, or overflow.
- Ensure the map container has a valid, non-zero height and width before map initialization.
- If the map is inside a tab, modal, drawer, or initially hidden container, trigger the library’s resize/invalidation method when it becomes visible.
- Verify the configured tile/map provider, URL, and API key restrictions without exposing secret keys. Do not bypass provider restrictions.
- Ensure map markers, driver/request locations, zoom controls, and any existing route/directions UI continue to work.
- Provide a graceful loading/error fallback if the map provider is unavailable. Do not present a fake map as real data.

**Acceptance criteria:**
- Map tiles render continuously and correctly without gaps, fragments, or overlapping artifacts.
- Map sizing responds correctly to layout changes.
- Existing markers and location-related features work.

## 9. Correct dropdown padding in Request Driver → Trip Purpose → Reason for Medical Transit

**Problem:** The padding/alignment of the “Reason for Medical Transit” dropdown does not look correct.

**Requirements:**
- Inspect the dropdown/select component and its styles in the Request Driver flow.
- Match its height, horizontal/vertical padding, text alignment, border, radius, font, and focus state to neighboring form fields.
- Ensure the selected value, placeholder, and dropdown indicator are aligned and not clipped.
- Verify native `<select>` or custom dropdown behavior across supported browsers and screen sizes.
- Preserve validation, keyboard operation, and accessibility.

**Acceptance criteria:**
- The dropdown aligns visually with adjacent inputs.
- Text and the dropdown indicator are not clipped or awkwardly spaced.
- Selection and validation continue to work.

## 10. Repair the Symptoms Check page

**Problem:** The Symptoms Check page does not work properly.

**Requirements:**
- Reproduce the issue and inspect the page’s form controls, validation, state handling, API integration, and navigation.
- Fix all identified broken interactions, including symptom selection/input, form submission, validation messages, loading state, and result rendering, according to the existing intended product behavior.
- Ensure submitted symptoms reach the correct backend endpoint and that the frontend correctly handles the response schema and non-success responses.
- Prevent duplicate submissions and show progress while processing.
- Provide clear validation and recovery messages for missing input, network errors, and server errors.
- If the page offers symptom guidance or triage, clearly communicate that it is informational and not a confirmed diagnosis. For severe/emergency symptoms, direct users to emergency services according to the project’s intended safety flow.
- Do not fabricate medical results, claim a diagnosis without an appropriate validated service, or silently discard user input.

**Acceptance criteria:**
- The complete symptom-check flow works from input through result/error state.
- Validation and backend failures are handled clearly.
- No false or fabricated medical results are shown.

## 11. Fix the Smart Match option and interface

**Problem:** The Smart Match option is not displaying properly.

**Requirements:**
- Inspect the Smart Match route, component, data dependencies, styles, and any API/service it uses.
- Fix layout, visibility, rendering, and interaction issues at desktop and mobile widths.
- Ensure Smart Match uses the intended real patient/request information and the project’s actual matching logic/service.
- Fix any failed requests, invalid data mapping, missing loading states, or component errors that prevent it from displaying.
- If no match is available, show a meaningful empty state. If the service fails, show a recoverable error state.
- Preserve accessibility and existing CareLink visual conventions.
- Do not invent hospitals, pharmacies, drivers, availability, or match scores.

**Acceptance criteria:**
- Smart Match is visible and usable from its intended route/entry point.
- Real results display correctly when available.
- Loading, empty, and error states are handled.

## 12. Add bed-booking functionality to the Hospitals page

**Problem:** The Hospitals page does not provide an option to book a bed.

**Requirements:**
- Add a clear **Book Bed** action to each eligible hospital/card or hospital details view, consistent with the existing design.
- Inspect the existing hospital and bed-availability data model and backend before implementation.
- The booking flow should allow the patient to view available bed categories/types and relevant availability information, then submit a booking request using the project’s existing rules and required patient details.
- Validate required fields and prevent submissions with missing or invalid information.
- Persist the booking through the backend/database and associate it with the authenticated patient and selected hospital.
- Re-check availability on the server when creating the booking. Prevent overbooking and handle conflicts if availability changes before confirmation.
- Display a clear confirmation with booking/reference details and current status. If booking is only a request pending hospital approval, label it accurately rather than implying it is confirmed.
- Provide loading, empty availability, success, and error states.
- Do not decrement or alter availability only in frontend state. Do not use fake bed counts.
- Protect patient and booking data through authentication and authorization.

**Acceptance criteria:**
- Eligible hospitals show a working Book Bed action.
- Patients can submit a valid booking/request for an actually available bed type.
- The backend safely validates availability and persists the booking.
- The patient receives an accurate confirmation/pending status.
- Overbooking and cross-patient data access are prevented.

## 13. Add the CareLink favicon

**Problem:** The browser tab does not display the CareLink logo as the website favicon.

**Requirements:**
- Locate the existing official CareLink logo asset in the repository and use it to create/select a suitable favicon. Do not invent a different brand mark if an official logo exists.
- Add the required favicon asset(s) in the correct public/static location for the framework.
- Update the HTML document head or framework metadata to reference the correct favicon path. Include suitable sizes/formats where supported by the project.
- Ensure the asset path works in both local development and the deployed app, including any configured base path.
- Avoid referencing a temporary local file path or a missing asset.
- Check for stale cached favicon behavior and explain how to hard-refresh/clear cache if needed.

**Acceptance criteria:**
- The CareLink logo appears in the browser tab after a fresh load/cache refresh.
- The favicon request returns successfully in development and production.

---

## Cross-cutting quality requirements

### API and backend reliability
- Check API base URLs, HTTP methods, endpoint paths, authentication headers/cookies, CORS where relevant, request payloads, response schemas, and error status codes.
- Use consistent error handling across the dashboard.
- Never parse a response body twice.
- Do not treat an HTTP error page as successful JSON.
- Keep environment variables and API secrets out of source control and browser-visible logs.

### UI and accessibility
- Maintain consistent spacing, typography, button states, dropdowns, dialogs, and cards.
- Provide loading, empty, error, and success states where appropriate.
- Support keyboard navigation, visible focus, accessible names, and appropriate ARIA/live-region usage.
- Check responsive layouts and avoid horizontal overflow.
- Ensure dialogs and dismissible banners can be operated with a keyboard.

### Data integrity and security
- Scope patient-specific data to the authenticated user on the backend.
- Validate incoming data on both client and server.
- Do not bypass forbidden responses by removing authorization.
- Do not fabricate patient orders, emergency requests, driver assignments, notifications, hospital matches, or bed availability.
- Do not expose patient data or sensitive API details in logs or error messages.

## Suggested implementation workflow

1. Map the existing routes/components and identify all related frontend and backend files.
2. Reproduce each issue and capture relevant browser console/network errors and backend logs.
3. Group root causes where possible (for example, shared API parsing or authentication bugs) and fix the underlying shared code first.
4. Implement the fixes in small, reviewable changes.
5. Test each affected flow manually and with existing automated tests.
6. Run the available lint, type-check, test, and production build commands.
7. Review the diff for unrelated changes, leaked secrets, debug logs, fake data, and authorization regressions.
8. Provide a concise completion report listing files changed, root causes found, fixes made, checks run, and any remaining blockers.

## Final verification checklist

- [ ] Pharmacy contact works without an unexpected Forbidden page.
- [ ] Sidebar stays in place while main content scrolls.
- [ ] Interactive controls show the correct cursor and remain accessible.
- [ ] SOS banner dismisses after 6–7 seconds and has a close button.
- [ ] SOS banner/details opens the correct emergency/trip and real driver information.
- [ ] Notifications handle valid JSON, empty responses, and API errors correctly.
- [ ] Patient medicine orders display correctly and pharmacy contact works from an order.
- [ ] Emergency Requests does not reload continuously and updates promptly without duplicates.
- [ ] Map renders correctly without broken tiles.
- [ ] Medical-transit reason dropdown spacing/alignment is fixed.
- [ ] Symptoms Check works through its intended complete flow.
- [ ] Smart Match displays and handles results/empty/error states.
- [ ] Hospitals page supports a safe, persistent bed-booking/request flow.
- [ ] CareLink favicon appears in the browser tab.
- [ ] Responsive layouts, accessibility, authentication, and patient data isolation are preserved.
- [ ] Available tests/lint/type-check/build commands pass, or any failures are documented.
