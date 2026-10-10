import type { AllocationHospital, AllocationPatient, AvailabilityForecaster, ReplanState, SimResourceType } from "../lib/allocation/types.ts";
import { ReservationLedger } from "../lib/allocation/ledger.ts";
import { allocateBatch, createReplanState, replan } from "../lib/allocation/engine.ts";
import { createModelForecaster, type LogisticModelArtifact } from "../lib/allocation/forecaster.ts";
import { baselineForecaster } from "../lib/allocation/baseline.ts";
import { HOSPITALS, createRng, type DecisionSample, type HospitalDay, type SimDay } from "./world.ts";
import type { TrainingStayDurations } from "./features.ts";
import { buildFeatureVector } from "./features.ts";

export interface ReplayPatient extends AllocationPatient { firstChoiceId: string }
export interface ReplayDraw { patientId: string; rejection: Record<string, number>; delay: Record<string, number> }
export interface ReplayEpisode { id: string; day: SimDay; minute: number; patients: ReplayPatient[]; hospitals: AllocationHospital[]; draws: ReplayDraw[] }
export interface ReplayOutcome { episodeId: string; patients: Array<{ patientId: string; urgency: number; firstChoice: boolean; reroutes: number; minutes: number | null; hospitalId: string | null; reason: string | null }>; logs: unknown[]; incompatible_allocations: number; double_counted_reservations: number }

export function buildReplayEpisodes(days: SimDay[], samples: DecisionSample[], count: number, seed: number): ReplayEpisode[] {
  if (!days.length || !samples.length) throw new Error("Replay requires non-empty split days and samples.");
  const random = createRng(seed); const byDay = new Map(days.map((day) => [day.day, day]));
  const episodes: ReplayEpisode[] = [];
  for (let e = 0; e < count; e += 1) {
    const sample = samples[Math.floor(random() * samples.length)]; const day = byDay.get(sample.day)!;
    const minute = sample.minute; const countPatients = 8 + Math.floor(random() * 8);
    const hospitals = HOSPITALS.map((spec) => ({ id: spec.id, name: spec.name, travelTimeMinutes: 8 + Math.floor(random() * 53), rejectionRate: spec.rejectionRate, capabilities: [...spec.capabilities], confirmedFree: Object.fromEntries((['icu_bed','emergency_bed'] as SimResourceType[]).map((type) => [type, day.hospitals.find((x) => x.hospitalId === spec.id && x.resourceType === type)!.observed.availableUnits[minute]])) as Record<SimResourceType, number>, supportedTypes: ['icu_bed','emergency_bed'] as SimResourceType[], closedTypes: (['icu_bed','emergency_bed'] as SimResourceType[]).filter((type) => !day.hospitals.find((x) => x.hospitalId === spec.id && x.resourceType === type)!.groundTruth.isOpen[minute]) }));
    const patients: ReplayPatient[] = [];
    for (let i = 0; i < countPatients; i += 1) {
      const resourceType: SimResourceType = random() < 0.36 ? 'icu_bed' : 'emergency_bed';
      const urgency = (1 + Math.floor(random() * 3)) as 1|2|3;
      const capability = random() < 0.42 ? (random() < 0.5 ? 'cardiac' : 'trauma') : undefined;
      const etaMin = 10 + Math.floor(random() * 51); const travelTimeLimitMin = random() < 0.18 ? 20 + Math.floor(random() * 25) : undefined;
      patients.push({ id: `e${e}-p${i}`, batchId: `d${day.day}e${e}`, urgency, waitingMinutes: Math.floor(random()*90), resourceType, ...(capability ? {capability} : {}), etaMin, ...(travelTimeLimitMin ? {travelTimeLimitMin} : {}), firstChoiceId: '' });
    }
    const draws = patients.map((patient) => ({ patientId: patient.id, rejection: Object.fromEntries(hospitals.map((h) => [h.id, random()])), delay: Object.fromEntries(hospitals.map((h) => [h.id, random()])) }));
    episodes.push({ id: `validation-day-${day.day}-episode-${e}`, day, minute, patients, hospitals, draws });
  }
  return episodes;
}

function makeModel(model: LogisticModelArtifact, days: SimDay[], samples: DecisionSample[]): AvailabilityForecaster {
  const modelForecast = createModelForecaster(model); const source = new Map<string, DecisionSample>();
  for (const s of samples) source.set(`${s.day}:${s.hospitalId}:${s.resourceType}`, s);
  const byDay = new Map(days.map((d) => [d.day,d]));
  return ({hospital, patient}) => {
    const dayNumber = Number(/^d(\d+)/.exec(patient.batchId)?.[1]);
    const day = byDay.get(dayNumber) ?? days[0];
    const sample = source.get(`${day.day}:${hospital.id}:${patient.resourceType}`) ?? samples.find((s) => s.hospitalId === hospital.id && s.resourceType === patient.resourceType)!;
    const hd = day.hospitals.find((x) => x.hospitalId === hospital.id && x.resourceType === patient.resourceType)!;
    const minute = sample.minute; const free = hospital.confirmedFree[patient.resourceType];
    const synthetic: DecisionSample = {...sample, etaMin: patient.etaMin, unitsNeeded: 1, label: 0, features: {...sample.features, freeNow: free, freeNowMinusK: free-1, k: 1, etaMin: patient.etaMin, occupancyRatio: Math.min(1, hd.observed.occupancy[minute] / Math.max(1,hd.observed.knownCapacity[minute])), closedNow: hospital.closedTypes.includes(patient.resourceType) ? 1 : 0}};
    return modelForecast(synthetic);
  };
}

export function modelForecaster(model: LogisticModelArtifact, days: SimDay[], samples: DecisionSample[]): AvailabilityForecaster { return makeModel(model, days, samples); }

export function runReplay(episode: ReplayEpisode, forecaster: AvailabilityForecaster): ReplayOutcome {
  const ledger = new ReservationLedger(episode.hospitals); const state: ReplanState = createReplanState(episode.patients); const logs: unknown[] = [];
  const result = allocateBatch(episode.patients, episode.hospitals, forecaster, ledger, state);
  const assignments = new Map(result.assignments.map((a) => [a.patientId,a]));
  for (const patient of episode.patients) patient.firstChoiceId = assignments.get(patient.id)?.hospitalId ?? '';
  const drawMap = new Map(episode.draws.map((d) => [d.patientId,d])); const outcomes: ReplayOutcome['patients'] = [];
  for (const patient of episode.patients) {
    let assignment = assignments.get(patient.id); let reason = result.unserved.find((x) => x.patientId === patient.id)?.reason ?? null;
    if (assignment) {
      ledger.transition(assignment.reservationId,'confirmed',episode.minute,'hospital','unit confirmed');
      const hosp = episode.hospitals.find((h) => h.id === assignment!.hospitalId)!; const draw = drawMap.get(patient.id)!;
      if (draw.rejection[hosp.id] < hosp.rejectionRate) {
        const replanned = replan({type:'hospital_rejection',reservationId:assignment.reservationId,at:episode.minute+1},episode.hospitals,forecaster,ledger,state);
        assignment = replanned.assignments[0]; reason = replanned.unserved[0]?.reason ?? null;
        if (assignment) ledger.transition(assignment.reservationId,'confirmed',episode.minute+1,'hospital','replanned unit confirmed');
        logs.push({event:'hospital_rejection',patientId:patient.id,replan:replanned});
      }
      if (assignment) {
        const eta = assignment.travelTimeMinutes;
        if (drawMap.get(patient.id)!.delay[assignment.hospitalId] < 0.12) {
          const changedEta = patient.etaMin + 15;
          const changed = replan({type:'eta_change',reservationId:assignment.reservationId,newEtaMin:changedEta,at:episode.minute+2},episode.hospitals,forecaster,ledger,state);
          assignment = changed.assignments[0]; reason = changed.unserved[0]?.reason ?? null;
          if (assignment) ledger.transition(assignment.reservationId,'confirmed',episode.minute+2,'hospital','ETA-change replan confirmed');
          logs.push({event:'eta_change',patientId:patient.id,newEtaMin:changedEta,replan:changed});
        }
        if (!assignment) {
          // The ETA change exhausted this patient's feasible alternatives.
        } else {
        const hd = episode.day.hospitals.find((x) => x.hospitalId === assignment!.hospitalId && x.resourceType === patient.resourceType)!;
        const arrivalMinute = Math.min(1439,episode.minute+eta);
        const loss = episode.day.hiddenEvents.find((ev) => ev.hospitalId === assignment!.hospitalId && ev.resourceType === patient.resourceType && ev.kind === 'resource_loss' && ev.minute > episode.minute && ev.minute <= arrivalMinute);
        const closure = episode.day.hiddenEvents.find((ev) => ev.hospitalId === assignment!.hospitalId && ev.resourceType === patient.resourceType && ev.kind === 'closure_start' && ev.minute > episode.minute && ev.minute <= arrivalMinute);
        if (loss || closure) {
          const event = loss ? {type:'resource_loss' as const,reservationId:assignment.reservationId,at:loss.minute} : {type:'closure' as const,hospitalId:assignment.hospitalId,resourceType:patient.resourceType,at:closure!.minute};
          const replanned = replan(event,episode.hospitals,forecaster,ledger,state); assignment = replanned.assignments[0]; reason = replanned.unserved[0]?.reason ?? null;
          if (assignment) ledger.transition(assignment.reservationId,'confirmed',event.at,'hospital','replanned unit confirmed');
          logs.push({event:event.type,patientId:patient.id,replan:replanned});
        }
        if (assignment) {
          const target = episode.day.hospitals.find((x) => x.hospitalId === assignment!.hospitalId && x.resourceType === patient.resourceType)!;
          const at = Math.min(1439,episode.minute+assignment.travelTimeMinutes);
          const free = target.groundTruth.freeUnits[at];
          if (!target.groundTruth.isOpen[at] || free < 1) {
            ledger.transition(assignment.reservationId,'arrived',at,'ambulance','arrived');
            const failed = replan({type:'arrival_failure',reservationId:assignment.reservationId,at},episode.hospitals,forecaster,ledger,state);
            assignment = failed.assignments[0]; reason = failed.unserved[0]?.reason ?? null;
            if (assignment) ledger.transition(assignment.reservationId,'confirmed',at,'hospital','replanned unit confirmed');
            logs.push({event:'arrival_failure',patientId:patient.id,replan:failed});
          }
        }
      }
      if (assignment) {
        ledger.transition(assignment.reservationId,'arrived',Math.min(1439,episode.minute+assignment.travelTimeMinutes),'ambulance','patient arrived');
        ledger.transition(assignment.reservationId,'handed_over',Math.min(1439,episode.minute+assignment.travelTimeMinutes),'hospital','handover completed');
          ledger.setConfirmedFree(assignment.hospitalId,patient.resourceType,Math.max(0,ledger.getConfirmedFree(assignment.hospitalId,patient.resourceType)-1),Math.min(1439,episode.minute+assignment.travelTimeMinutes));
      }
        }
    }
    const finalReservation = ledger.reservations.filter((r) => r.patientId===patient.id).at(-1);
    const success = finalReservation?.status === 'handed_over';
    if (!success && !reason) reason = 'capacity_exhausted';
    outcomes.push({patientId:patient.id,urgency:patient.urgency,firstChoice:Boolean(assignments.get(patient.id) && assignments.get(patient.id)!.hospitalId===finalReservation?.hospitalId),reroutes:state.reroutes.get(patient.id)??0,minutes:success ? (assignment?.travelTimeMinutes??patient.etaMin)+(state.reroutes.get(patient.id)??0)*25 : null,hospitalId:success?finalReservation!.hospitalId:null,reason:success?null:reason});
  }
  ledger.assertInvariants();
  const incompatible = ledger.reservations.filter((r)=>r.resourceType!==episode.patients.find((p)=>p.id===r.patientId)?.resourceType).length;
  const duplicates = ledger.reservations.filter((r,i,a)=>a.findIndex((x)=>x.patientId===r.patientId&&['requested','confirmed','arrived'].includes(x.status))===i && a.filter((x)=>x.patientId===r.patientId&&['requested','confirmed','arrived'].includes(x.status)).length>1).length;
  return {episodeId:episode.id,patients:outcomes,logs,incompatible_allocations:incompatible,double_counted_reservations:duplicates};
}

export const baselineReplayForecaster = (input: Parameters<AvailabilityForecaster>[0]) => input.hospital.confirmedFree[input.patient.resourceType] > 0 ? 1 : 0;
export { baselineForecaster };
