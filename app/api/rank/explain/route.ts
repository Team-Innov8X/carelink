import { z } from "zod";
import { POST as rankHospitals } from "../route";
import { POST as rankPharmacies } from "../../pharmacy/matches/route";
import { selectExplanationFocus } from "@/lib/gemini";
import { buildMatchExplanation } from "@/lib/smart-match-explanation";
import { requireRole } from "@/lib/auth-utils";

export const runtime = "nodejs";

const hospitalInput = z.object({
  kind: z.literal("hospital"), candidateId: z.string().min(1).max(200),
  criteria: z.object({ emergencyType: z.string().trim().min(1).max(100), ambulanceLocation: z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) }), requiredResources: z.array(z.string().trim().min(1).max(100)).max(20), preferredResources: z.array(z.string().trim().min(1).max(100)).optional(), maxTravelMinutes: z.number().finite().min(1).max(240), bedCategory: z.string().trim().min(1).max(100), priority: z.enum(["balanced", "resources", "travel", "freshness"]).optional(), limit: z.number().int().min(1).max(100).default(100) }),
});
const pharmacyInput = z.object({
  kind: z.literal("pharmacy"), candidateId: z.string().min(1).max(200),
  criteria: z.object({ medicine: z.string().trim().min(1).max(160), quantity: z.number().int().min(1).max(1000), origin: z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) }), radiusKm: z.number().finite().min(1).max(100).default(25), limit: z.number().int().min(1).max(100).default(100) }),
});

export async function POST(request: Request) {
  const auth = await requireRole(["patient", "dispatcher"]);
  if (!auth.authorized) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  let raw: unknown;
  try { raw = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const hospital = hospitalInput.safeParse(raw);
  const pharmacy = hospital.success ? null : pharmacyInput.safeParse(raw);
  const selected = hospital.success ? hospital.data : pharmacy?.success ? pharmacy.data : null;
  if (!selected) return Response.json({ error: "Provide valid search criteria and a match identifier." }, { status: 400 });
  try {
    const route = selected.kind === "hospital" ? rankHospitals : rankPharmacies;
    const response = await route(new Request(request.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(selected.criteria) }));
    const body = await response.json();
    if (!response.ok) return Response.json({ error: body.error ?? "Could not retrieve current match facts." }, { status: response.status });
    const ranked = (body.ranked ?? []) as Array<Record<string, unknown>>;
    const match = ranked.find((item) => String(selected.kind === "hospital" ? item.hospitalId : item.pharmacyId) === selected.candidateId);
    if (!match) return Response.json({ error: "This match is no longer in the current results. Refresh the search." }, { status: 404 });

    const factualExplanation = selected.kind === "hospital"
      ? buildMatchExplanation(match as Parameters<typeof buildMatchExplanation>[0])
      : String(match.explanation ?? "The pharmacy match is based on current database inventory and calculated score factors.");
    const focusFallback = selected.kind === "hospital" && Number((match as { scoreBreakdown?: { freshness?: number } }).scoreBreakdown?.freshness) < 0.5 ? "freshness" : "requirements";
    let focus = focusFallback;
    let source: "gemini" | "fallback" = "fallback";
    if (process.env.GEMINI_API_KEY) {
      try {
        const facts = selected.kind === "hospital"
          ? { kind: "hospital", matchedResources: match.matchedResources, missingResources: match.missingResources, score: match.score, scoreBreakdown: match.scoreBreakdown, scoreContributions: match.scoreContributions, distanceKm: match.distanceKm, travelTimeMinutes: match.travelTimeMinutes }
          : { kind: "pharmacy", medicineName: match.medicineName, availability: match.availability, requestedQuantity: match.requestedQuantity, availableQuantity: match.availableQuantity, score: match.score, scoreBreakdown: match.scoreBreakdown, scoreContributions: match.scoreContributions, distanceKm: match.distanceKm };
        const parsedFocus = z.object({ focus: z.enum(["requirements", "freshness", "score", "distance"]) }).safeParse(JSON.parse(await selectExplanationFocus(process.env.GEMINI_API_KEY, `Choose the most useful explanation emphasis for these verified match facts. Output the focus enum only. Do not add facts or infer missing information. Facts: ${JSON.stringify(facts)}`)));
        if (parsedFocus.success) { focus = parsedFocus.data.focus; source = "gemini"; }
      } catch { /* A deterministic explanation is always available. */ }
    }
    const lead: Record<string, string> = {
      requirements: "Requirements and eligibility:", freshness: "Availability freshness:", score: "Calculated score:", distance: "Estimated distance and travel:",
    };
    const configurationWarning = !process.env.GEMINI_API_KEY && process.env.NODE_ENV !== "production"
      ? "Gemini is not configured. Set GEMINI_API_KEY in the server environment (.env.local locally). Showing a deterministic explanation."
      : undefined;
    return Response.json({ explanation: `${lead[focus]} ${factualExplanation}`, source, ...(configurationWarning ? { configurationWarning } : {}) });
  } catch {
    return Response.json({ error: "Could not explain this match right now." }, { status: 503 });
  }
}
