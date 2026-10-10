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
  stale: boolean;
  exclusionReason?: string;
  scoreBreakdown: {
    facilityScore: number;
    etaScore: number;
    freshnessScore: number;
    resourceScore: number;
  };
}

export function calculateHospitalRecommendations(
  request: EmergencyRequest,
  hospitals: Hospital[],
  etaByHospital: Record<string, number> = {},
  weights = { resource: 50, travel: 30, freshness: 20 },
  staleThresholdMinutes = 10,
): HospitalRecommendation[] {
  const recommendations = hospitals.map((hosp) => {
    const etaMin = etaByHospital[hosp.id] ?? hosp.etaMin;
    // Transparent score weights: resource match 50%, travel 30%, freshness 20%.
    const required = request.requiredFacilities;
    const matchingSpecialties = required.filter((spec) =>
      hosp.specialties.some((hs) => hs.toLowerCase().includes(spec.toLowerCase()) || spec.toLowerCase().includes(hs.toLowerCase()))
    );
    const missingSpecialties = required.filter(
      (spec) => !matchingSpecialties.includes(spec)
    );
    const facilityRatio = required.length > 0 ? matchingSpecialties.length / required.length : 1;

    // Travel score favors hospitals within the case's target ETA.
    const targetEta = request.etaLimitMin || 20;
    let etaRatio = 1;
    if (etaMin <= targetEta) {
      etaRatio = 1 - (etaMin / (targetEta * 1.5));
    } else {
      etaRatio = Math.max(0.1, 1 - (etaMin - targetEta) / 20);
    }
    const etaScore = Math.min(30, Math.max(0, etaRatio * 30));

    let hasCapacity = false;
    
    // Check if hospital has the specialized bed needed
    const needsTrauma = required.some((f) => f.toLowerCase().includes('trauma'));
    const needsIcu = required.some((f) => f.toLowerCase().includes('icu'));
    const needsVent = required.some((f) => f.toLowerCase().includes('ventilator'));

    const traumaAvail = hosp.beds.trauma.available;
    const icuAvail = hosp.beds.icu.available;
    const ventAvail = hosp.beds.ventilators.available;
    const bedMatches = [!needsTrauma || traumaAvail > 0, !needsIcu || icuAvail > 0, !needsVent || ventAvail > 0].filter(Boolean).length;
    const bedRequirements = [needsTrauma, needsIcu, needsVent].filter(Boolean).length;

    hasCapacity =
      (!needsTrauma || traumaAvail > 0) &&
      (!needsIcu || icuAvail > 0) &&
      (!needsVent || ventAvail > 0);

    const resourceRaw = facilityRatio * 30 + (bedRequirements ? 20 * (bedMatches / bedRequirements) : 20);
    const resourceScore = Math.round(resourceRaw / 50 * weights.resource);
    const weightedEtaScore = Math.round(etaScore / 30 * weights.travel);
    const stale = hosp.lastUpdatedMinutesAgo >= staleThresholdMinutes;
    const freshnessScore = Math.max(0, weights.freshness * (1 - Math.min(hosp.lastUpdatedMinutesAgo, staleThresholdMinutes * 6) / (staleThresholdMinutes * 6)));
    const matchScore = Math.max(0, Math.min(100, Math.round(resourceScore + weightedEtaScore + freshnessScore)));
    const exclusionReason = !hasCapacity ? 'No bed available for a required resource' : missingSpecialties.length ? `Missing ${missingSpecialties.join(', ')}` : undefined;

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
      stale,
      exclusionReason,
      scoreBreakdown: {
        facilityScore: Math.round(facilityRatio * weights.resource),
        etaScore: weightedEtaScore,
        freshnessScore: Math.round(freshnessScore),
        resourceScore,
      },
    };
  });

  // Sort descending by matchScore
  return recommendations.sort((a, b) => Number(a.stale) - Number(b.stale) || Number(b.hasCapacity) - Number(a.hasCapacity) || b.matchScore - a.matchScore);
}
