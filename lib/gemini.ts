import { GoogleGenAI } from "@google/genai";

export const SMART_MATCH_GEMINI_MODEL = "gemini-3.8-flash";

const clientFor = (apiKey: string) => new GoogleGenAI({ apiKey, httpOptions: { timeout: 8_000 } });

export async function generateSmartMatchCriteria(apiKey: string, prompt: string) {
  const response = await clientFor(apiKey).models.generateContent({
    model: SMART_MATCH_GEMINI_MODEL,
    contents: prompt,
    config: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          resourceType: { type: "STRING", enum: ["hospital", "pharmacy"] },
          emergencyType: { type: "STRING" },
          requiredResources: { type: "ARRAY", items: { type: "STRING" } },
          preferredResources: { type: "ARRAY", items: { type: "STRING" } },
          bedCategory: { type: "STRING", enum: ["general", "icu", "trauma", "pediatric", "emergency", "isolation", "ventilator"] },
          maxTravelMinutes: { type: "INTEGER" },
          priority: { type: "STRING", enum: ["balanced", "resources", "travel", "freshness"] },
          medicine: { type: "STRING" },
          quantity: { type: "INTEGER" },
        },
        required: ["resourceType", "emergencyType", "requiredResources", "preferredResources", "bedCategory", "maxTravelMinutes", "priority", "medicine", "quantity"],
      },
    },
  });
  if (!response.text) throw new Error("Gemini returned an empty response.");
  return response.text;
}

export async function selectExplanationFocus(apiKey: string, prompt: string) {
  const response = await clientFor(apiKey).models.generateContent({
    model: SMART_MATCH_GEMINI_MODEL,
    contents: prompt,
    config: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: { focus: { type: "STRING", enum: ["requirements", "freshness", "score", "distance"] } },
        required: ["focus"],
      },
    },
  });
  if (!response.text) throw new Error("Gemini returned an empty response.");
  return response.text;
}
