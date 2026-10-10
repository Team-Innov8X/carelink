# Item B — SOS confirmation panel

## Changes made

- Added a close button that dismisses only the confirmation panel. The SOS request is not changed when the panel is dismissed.
- Kept the panel announced with `role="status"` and polite live-region behavior.
- Added a 30-second auto-dismiss timer. The timer pauses while the pointer is over the panel or keyboard focus is inside it, then resumes with the remaining time.
- Added a separate **Cancel SOS** action in the confirmation panel and patient request history. It requires confirmation and is offered only while the request is searching or accepted before pickup begins.
- Added `POST /api/sos/[id]/cancel`. It verifies patient ownership, atomically cancels only an active pre-pickup request, releases the driver, closes the linked hospital request, and cancels a linked bed hold when present.
- Updated bed-hold cancellation to return confirmed bed capacity when a pre-pickup SOS is cancelled.
- The SOS remains stored with `status: "cancelled"`, so it stays visible in request history. Dismissing the panel has no effect on the request record.

## Files changed for Item B

- `App.tsx`
- `components/patient/PatientEmergencyRequestsView.tsx`
- `app/api/sos/[id]/cancel/route.ts`
- `lib/sos.ts`
- `lib/services/hold-service.ts`

## Verification

- `npx tsc --noEmit` — passed.
- `npm run build` — passed; Next.js compiled the new `/api/sos/[id]/cancel` route.

No live database workflow or browser interaction was run as part of this implementation.
