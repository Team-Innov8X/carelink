# Symptom Triage audit

START_COMMIT: `5b1bca4f8b5a922daa12a9f71825ad73d836c809`
Audit branch: `triage-fix`
Tag: `tri-start`

## Existing implementation

| Area | File | Findings |
|---|---|---|
| Tab mount | `App.tsx:178` | Patient triage tab renders `TriageChatView`; leave other tabs and app shell behavior intact. |
| Triage UI and response formatting | `components/patient/TriageChatView.tsx` | One client component owns chat, ranking, SOS dispatch, emergency banner, audit inspector, response labels, and quick prompts. The whole component will be replaced with the requested focused chat and summary UI. |
| API route | `app/api/triage-chat/route.ts` | Patient-authenticated route currently always returns 503; reuse this route and patient auth convention. |
| Model adapter/schema | `lib/ai.ts` | Existing Grok-compatible OpenAI chat-completions adapter uses legacy `AI_*` env vars and a different schema. Replace or adapt behind the new provider-agnostic triage interface. |
| Prompt and response policy | `lib/triage-config.ts`, `lib/triage-policy.ts` | Existing legacy prompt/examples and sanitizer exist; replace with the new contract and deterministic intent policy. |
| Emergency fallback config | `lib/dispatch/constants.ts` | Existing `EMERGENCY_FALLBACK_TEXT` is available; triage will reuse it. |
| Navigation | `components/common/Sidebar.tsx`, `components/mobile/MobileNav.tsx` | Desktop and mobile patient navigation are separate; demo filtering must be applied consistently. |
| Existing tests | `test/triage-policy.test.mjs` | Tests cover the obsolete output contract. Replace with tests for gate, schema, fallback, red flags, and route-facing behavior. |

## Requested removals in current triage UI

| Item | File and line (at audit) |
|---|---|
| “Call immediately” persistent banner | `components/patient/TriageChatView.tsx:274-296` |
| “Inspect JSON” control | `components/patient/TriageChatView.tsx:330-339` |
| JSON inspector panel and state | `components/patient/TriageChatView.tsx:86-87, 342-351` |
| Inline emergency call controls with hardcoded numbers | `components/patient/TriageChatView.tsx:393` |
| Escalation SOS control and hospital ranking UI/handlers | `components/patient/TriageChatView.tsx:101-221, 378-480` |
| Sparkle/AI demo styling | `components/patient/TriageChatView.tsx:10, 315, 319, 521` |

## Reuse plan

- Keep `/api/triage-chat` and its existing patient authentication.
- Reuse the configured emergency sentence constant from `lib/dispatch/constants.ts`.
- Reuse `zod`, already installed, for server-side model response validation.
- Keep the global app shell and SOS functionality outside the triage tab untouched.
- Keep existing care navigation features; only apply the demo allowlist in navigation.

No product code was changed in this audit phase.
