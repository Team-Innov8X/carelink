import { Hospital, EmergencyRequest } from '../types';

export interface HospitalRecommendation {
  hospital: Hospital;
  matchScore: number; // 0 - 100
  matchingSpecialties: string[];
  missingSpecialties: string[];
  etaMin: number;
  distanceKm: number;
  availableBedHighlights: {
    general: number;
    icu: number;
    trauma: number;
    ventilators: number;
  };
  hasCapacity: boolean;
  scoreBreakdown: {
    facilityScore: number;
    etaScore: number;
    capacityScore: number;
  };
}

export function calculateHospitalRecommendations(
  request: EmergencyRequest,
  hospitals: Hospital[],
  etaByHospital: Record<string, number> = {},
): HospitalRecommendation[] {
  const recommendations = hospitals.map((hosp) => {
    const etaMin = etaByHospital[hosp.id] ?? hosp.etaMin;
    // 1. Facility match score (40% weight)
    const required = request.requiredFacilities;
    const matchingSpecialties = required.filter((spec) =>
      hosp.specialties.some((hs) => hs.toLowerCase().includes(spec.toLowerCase()) || spec.toLowerCase().includes(hs.toLowerCase()))
    );
    const missingSpecialties = required.filter(
      (spec) => !matchingSpecialties.includes(spec)
    );
    const facilityRatio = required.length > 0 ? matchingSpecialties.length / required.length : 1;
    const facilityScore = facilityRatio * 45;

    // 2. ETA & Distance score (35% weight)
    // If ETA is <= request.etaLimitMin, higher score
    const targetEta = request.etaLimitMin || 20;
    let etaRatio = 1;
    if (etaMin <= targetEta) {
      etaRatio = 1 - (etaMin / (targetEta * 1.5));
    } else {
      etaRatio = Math.max(0.1, 1 - (etaMin - targetEta) / 20);
    }
    const etaScore = Math.min(35, Math.max(5, etaRatio * 35));

    // 3. Bed Capacity score (20% weight)
    let capacityScore = 0;
    let hasCapacity = false;
    
    // Check if hospital has the specialized bed needed
    const needsTrauma = required.some((f) => f.toLowerCase().includes('trauma'));
    const needsIcu = required.some((f) => f.toLowerCase().includes('icu'));
    const needsVent = required.some((f) => f.toLowerCase().includes('ventilator'));

    const traumaAvail = hosp.beds.trauma.available;
    const icuAvail = hosp.beds.icu.available;
    const ventAvail = hosp.beds.ventilators.available;
    const genAvail = hosp.beds.general.available;

    if (needsTrauma && traumaAvail > 0) capacityScore += 8;
    if (needsIcu && icuAvail > 0) capacityScore += 6;
    if (needsVent && ventAvail > 0) capacityScore += 6;
    if (genAvail > 0) capacityScore += 5;

    hasCapacity =
      (!needsTrauma || traumaAvail > 0) &&
      (!needsIcu || icuAvail > 0) &&
      (!needsVent || ventAvail > 0);

    // Bonus for Available status
    if (hosp.status === 'Available') capacityScore += 5;
    if (hosp.status === 'Full') capacityScore = Math.max(0, capacityScore - 15);

    const totalRaw = facilityScore + etaScore + capacityScore;
    // Normalize to 50-98 range for realistic medical triage scoring
    const matchScore = Math.min(98, Math.max(35, Math.round(totalRaw)));

    return {
      hospital: hosp,
      matchScore,
      matchingSpecialties,
      missingSpecialties,
      etaMin,
      distanceKm: hosp.distanceKm,
      availableBedHighlights: {
        general: hosp.beds.general.available,
        icu: hosp.beds.icu.available,
        trauma: hosp.beds.trauma.available,
        ventilators: hosp.beds.ventilators.available,
      },
      hasCapacity,
      scoreBreakdown: {
        facilityScore: Math.round(facilityScore),
        etaScore: Math.round(etaScore),
        capacityScore: Math.round(capacityScore),
      },
    };
  });

  // Sort descending by matchScore
  return recommendations.sort((a, b) => b.matchScore - a.matchScore);
}
