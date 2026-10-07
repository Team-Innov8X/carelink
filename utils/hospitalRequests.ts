import type { EmergencyRequest, Hospital } from "../types";

export async function submitBedRequest(hospital: { id: string; name: string }, emergency: EmergencyRequest) {
  const response = await fetch("/api/hospital-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hospitalId: hospital.id,
      hospitalName: hospital.name,
      location: {
        latitude: emergency.location.lat,
        longitude: emergency.location.lng,
      },
      incidentType: emergency.condition,
      requiredEquipment: emergency.requiredFacilities,
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not send the bed request.");
  return result;
}
