# Symptom Triage audit

START_COMMIT: `5b1bca4f8b5a922daa12a9f71825ad73d836c809`
Audit branch: `triage-fix`
Tag: `tri-start`

## Current implementation

| Area | File | Current responsibility |
|---|---|---|
| Patient tab mount | `App.tsx` | Renders `TriageChatView` only for the patient triage tab. Keep the rest of the app shell and tabs unchanged. |
| Chat UI | `components/patient/TriageChatView.tsx` | Owns the focused chat, quick-start prompts, severity display, summary, and retry/offline states. |
| API route | `app/api/triage-chat/route.ts` | Checks patient authentication, input size, rate limit, intent, model result, and emergency overrides. |
| Intent and fallback rules | `lib/triage/gate.ts` | Deterministic greeting/off-topic/unclear/symptom gate, red flags, safe response fallback. |
| Provider adapter | `lib/triage/llm.ts` | Calls the configured OpenAI-compatible endpoint and validates intent/model response data. |
| Prompt and examples | `lib/triage/prompt.ts` | Holds the symptom-only policy, conversation behavior, and few-shot examples. |
| Limits and display config | `lib/triage/constants.ts` | Message/history/follow-up/rate limits, specialty list, quick-start prompts, emergency sentence. |
| Structured response validation | `lib/triage/schema.ts` | Validates severity, reply, next steps, follow-up, specialties, and unsafe claims. |
| Automated triage tests | `tests/triage.test.ts` | Covers deterministic gate, red flags, adapter validation/fallbacks, and rate limit. |
| Demo prompts | `docs/TRIAGE_DEMO_SCRIPT.md` | Lists prompts and expected behavior for the demo. |
| Manual QA checklist | `docs/TRIAGE_QA.md` | Lists viewport, offline, and provider-failure checks. |

## Removal audit

The current triage component and triage source files contain no "Call immediately" action or "Inspect JSON" control/panel. A repository search found those terms only in the requirements/specification and this audit history; they are retained there to document the requirement. Other app tabs and navigation were not changed for the triage work.

## Findings driving the current fix

- The provider is configured with the Groq OpenAI-compatible endpoint and Qwen model in the ignored `.env` file. The key is intentionally not recorded here.
- A direct live call through `lib/triage/llm.ts` succeeds and returns a validated, tailored headache response.
- The route currently returns one generic non-emergency response whenever the model call or schema validation fails. This hides distinct symptom context and makes provider failures look like repeated model answers.
- Current server logs also show Better Auth session lookups failing when MongoDB DNS resolution fails. Authentication must remain enabled; this environmental database failure can prevent the protected API route from reaching triage at all.

## Security and reuse decisions

- Keep patient authentication and the existing `/api/triage-chat` route.
- Keep provider credentials server-side in ignored environment files; never log or display them.
- Keep logs limited to intent, severity, latency, fallback status, and safe provider error categories.
- Keep emergency handling deterministic: a positive red-flag match overrides model severity and includes `EMERGENCY_FALLBACK_TEXT` in the reply.
