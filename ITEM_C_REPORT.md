# Item C — Symptom check redesign

## Changes made

- Reworked the page into a full-height symptom conversation with a fixed-bottom composer, a plain “Symptom check” title, and the guidance-only disclaimer.
- Removed free-form error details, raw model output/debug UI, the call-immediately treatment, and decorative sparkle styling from the symptom-check entry points. The error state now uses the requested plain copy and an in-app SOS action.
- Added a responsive summary panel with urgency text plus a distinct symbol, plain-language category, and real navigation buttons for nearby hospitals, routine driver booking, and SOS when urgency is high or critical.
- Hospital navigation carries the category into the nearby map and filters registered hospitals using their specialty metadata.
- Replaced the old triage API with a server-only, provider-agnostic `lib/ai.ts` wrapper using `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL`. The endpoint checks authentication, limits input to 500 characters, applies a per-user 10-per-minute limit, stores sanitized conversation history by conversation ID, sends only the last six messages, and keeps at most 20 messages for one hour.
- Added a Zod output contract and one retry for invalid model JSON. Server policy replaces irrelevant/instruction-injection replies with the fixed refusal, suppresses off-topic triage fields, limits follow-ups to two, enforces escalation for high/critical urgency, and controls the action buttons.
- Added PII redaction for common name, email, phone, and exact-address patterns before storing or sending messages. Age is extracted separately when recognizable. The model request does not enable any data-sharing option.
- Added ten few-shot examples, including every required case.

## Files changed

- `.env.example`
- `app/api/triage-chat/route.ts`
- `components/common/Sidebar.tsx`
- `components/hospitals/NearbyFacilitiesPanel.tsx`
- `components/mobile/MobileNav.tsx`
- `components/patient/TriageChatView.tsx`
- `lib/ai.ts`
- `lib/models/hospital.ts`
- `lib/places.ts`
- `lib/triage-config.ts`
- `lib/triage-policy.ts`
- `package.json`
- `test/triage-policy.test.mjs`

## Verification

- `npm run test:triage` — 4 tests passed, covering the required example set, severity/escalation cases, injection refusal, privacy redaction, and follow-up limit.
- `npx tsc --noEmit` — passed.
- `npm run build` — passed; `/api/triage-chat` is included in the production route build.
- `git diff --check` — passed.

## xAI account setup

No `AI_API_KEY` or `AI_MODEL` is configured in the local environment, and the xAI Console opened to its sign-in page. I did not enter credentials. Set these server-side environment variables before a live model check; choose an `AI_MODEL` available to the account’s API key in the Console. The console’s account-specific credits and limits could not be inspected, so the API currently fails safely to the in-app error state until configured.
