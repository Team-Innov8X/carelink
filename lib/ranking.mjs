/**
 * @typedef {{ latitude: number, longitude: number }} Coordinates
 * @typedef {{ hospitalId: string, type: string, category: string, availableQuantity: number, status?: string }} RankableResource
 * @typedef {{ id: string, name: string, location: { type: "Point", coordinates: [number, number] }, status: string }} RankableHospital
 */

const EMERGENCY_RESOURCE_NEEDS = {
  cardiac: ["cardiologist", "defibrillator", "icu"],
  cardiac_arrest: ["cardiologist", "defibrillator", "icu"],
  heart_attack: ["cardiologist", "defibrillator", "icu"],
  trauma: ["trauma_surgeon", "emergency", "icu"],
  accident: ["trauma_surgeon", "emergency", "icu"],
  respiratory: ["ventilator", "oxygen_cylinder", "icu"],
  breathing: ["ventilator", "oxygen_cylinder", "icu"],
  stroke: ["neurologist", "icu"],
  neurological: ["neurologist", "icu"],
  pediatric: ["pediatrician", "pediatric"],
  child: ["pediatrician", "pediatric"],
};

const EARTH_RADIUS_KM = 6371.0088;

/** @param {string} value */
function normalize(value) {
  return value.trim().toLowerCase().replace(/[ -]+/g, "_");
}

/** @param {Coordinates} origin @param {[number, number]} destination */
export function distanceKm(origin, destination) {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const [longitude, latitude] = destination;
  const lat1 = toRadians(origin.latitude);
  const lat2 = toRadians(latitude);
  const deltaLat = lat2 - lat1;
  const deltaLng = toRadians(longitude - origin.longitude);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Return up to three hospitals ordered by emergency fit, available resources, and distance.
 * The score is a 0–100 weighted sum: fit (50), capacity (30), and distance (20).
 * @param {{ emergencyType: string, ambulanceLocation: Coordinates, hospitals: RankableHospital[], resources: RankableResource[] }} input
 */
export function rankHospitals({ emergencyType, ambulanceLocation, hospitals, resources }) {
  const needs = EMERGENCY_RESOURCE_NEEDS[normalize(emergencyType)] ?? [normalize(emergencyType)];

  return hospitals.map((hospital) => {
    const hospitalResources = resources.filter((resource) => resource.hospitalId === hospital.id);
    const usableResources = hospitalResources.filter((resource) => resource.status !== "unavailable" && resource.availableQuantity > 0);
    const matchedNeeds = needs.filter((need) => usableResources.some((resource) => normalize(resource.category) === need));
    const fitScore = needs.length ? matchedNeeds.length / needs.length * 50 : 0;
    const capacityScore = Math.min(30, usableResources.reduce((total, resource) => total + resource.availableQuantity, 0) * 3);
    const distance = distanceKm(ambulanceLocation, hospital.location.coordinates);
    const distanceScore = 20 * Math.exp(-distance / 15);
    const statusPenalty = hospital.status === "inactive" ? 30 : hospital.status === "full" ? 20 : hospital.status === "busy" ? 8 : 0;
    const score = Math.max(0, Math.round((fitScore + capacityScore + distanceScore - statusPenalty) * 100) / 100);

    return {
      hospitalId: hospital.id,
      name: hospital.name,
      score,
      distanceKm: Math.round(distance * 100) / 100,
      availableResources: usableResources.reduce((total, resource) => total + resource.availableQuantity, 0),
      matchedNeeds,
      status: hospital.status,
    };
  }).sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm || a.name.localeCompare(b.name)).slice(0, 3);
}
