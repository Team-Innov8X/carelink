import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { allocateBatch } from "../lib/allocation/engine.ts";
import { ReservationLedger } from "../lib/allocation/ledger.ts";
import { createModelForecaster, type LogisticModelArtifact } from "../lib/allocation/forecaster.ts";
import { buildFeatureVector } from "./features.ts";
import type { DecisionSample, SimDay } from "./world.ts";
import type { ReplayEpisode, ReplayOutcome } from "./replay.ts";

const root=fileURLToPath(new URL("../",import.meta.url));
type Log={scenario:string;episode:ReplayEpisode;baseline:ReplayOutcome;modelAware:ReplayOutcome;scenarioNotes:Record<string,unknown>};
type Dataset={split:string;days:SimDay[];samples:DecisionSample[]};

async function main(){
 const dataset=JSON.parse(await readFile(join(root,"data/synthetic/val.json"),"utf8")) as Dataset;
 if(dataset.split!=="validation"||dataset.days.some(d=>d.day<31||d.day>40))throw new Error("Scenario files may only be derived from validation days 31–40.");
 const model=JSON.parse(await readFile(join(root,"model/model.json"),"utf8")) as LogisticModelArtifact;
 const forecaster=createModelForecaster(model); const outputDir=join(root,"data/scenarios"); await mkdir(outputDir,{recursive:true});
 for(let n=1;n<=6;n++){
  const log=JSON.parse((await readFile(join(root,"evidence/replay-logs",`S${n}.jsonl`),"utf8")).trim()) as Log;
  const episode=log.episode; const patients=episode.patients.map(({firstChoiceId:_,...patient})=>patient);
  const assignment=allocateBatch(patients,episode.hospitals,({hospital,patient})=>{
   const sample=dataset.samples.find(s=>s.day===episode.day.day&&s.hospitalId===hospital.id&&s.resourceType===patient.resourceType)!;
   const hd=episode.day.hospitals.find(h=>h.hospitalId===hospital.id&&h.resourceType===patient.resourceType)!;
   const synthetic:DecisionSample={...sample,etaMin:patient.etaMin,unitsNeeded:1,label:0,features:{...sample.features,freeNow:hospital.confirmedFree[patient.resourceType],freeNowMinusK:hospital.confirmedFree[patient.resourceType]-1,k:1,etaMin:patient.etaMin,occupancyRatio:Math.min(1,hd.observed.occupancy[sample.minute]/Math.max(1,hd.observed.knownCapacity[sample.minute]))}};
   return forecaster(synthetic);
  },new ReservationLedger(episode.hospitals));
  const resultsByPatient=new Map(log.modelAware.patients.map(p=>[p.patientId,p]));
  const forecastFor=(patient:typeof patients[number],hospital:typeof episode.hospitals[number])=>{const sample=dataset.samples.find(s=>s.day===episode.day.day&&s.hospitalId===hospital.id&&s.resourceType===patient.resourceType)!;const hd=episode.day.hospitals.find(h=>h.hospitalId===hospital.id&&h.resourceType===patient.resourceType)!;return forecaster({...sample,etaMin:patient.etaMin,unitsNeeded:1,label:0,features:{...sample.features,freeNow:hospital.confirmedFree[patient.resourceType],freeNowMinusK:hospital.confirmedFree[patient.resourceType]-1,k:1,etaMin:patient.etaMin,occupancyRatio:Math.min(1,hd.observed.occupancy[sample.minute]/Math.max(1,hd.observed.knownCapacity[sample.minute]))}});};
  const patientsOut=patients.map(p=>{const result=resultsByPatient.get(p.id);const probabilityByHospital=Object.fromEntries(episode.hospitals.map(h=>[h.id,forecastFor(p,h)]));return {id:p.id,urgency:p.urgency,requiredResource:p.resourceType,assignedHospital:result?.hospitalId??null,etaMin:p.etaMin,pAvailable:result?.hospitalId?probabilityByHospital[result.hospitalId]??0:0,probabilityByHospital,status:result?.minutes!==null&&result?.minutes!==undefined?"handed_over":"unserved",reason:result?.reason??null,reroutes:result?.reroutes??0};});
  const hospitalOut=episode.hospitals.map(h=>({id:h.id,name:h.name,freeUnits:{icu_bed:h.confirmedFree.icu_bed,emergency_bed:h.confirmedFree.emergency_bed},closed:h.closedTypes.length>0}));
  const timeline:Array<{at:number;patientId:string;hospitalId?:string;event:string;status:string;reason?:string}> = [];
  for(const p of patientsOut){const result=resultsByPatient.get(p.id);if(result?.hospitalId){timeline.push({at:episode.minute,patientId:p.id,event:"hold_requested",status:"requested"});timeline.push({at:episode.minute+1,patientId:p.id,event:"hospital_confirmed",status:"confirmed"});for(const item of (log.modelAware.logs as Array<{event:string;patientId:string}>).filter(x=>x.patientId===p.id))timeline.push({at:episode.minute+2,patientId:p.id,event:item.event,status:"replanned"});timeline.push({at:episode.minute+p.etaMin,patientId:p.id,event:"handover_completed",status:"handed_over"});}else timeline.push({at:episode.minute,patientId:p.id,event:"unserved",status:"unserved",reason:result?.reason??"capacity_exhausted"});}
  for(const event of episode.day.hiddenEvents)if(event.kind==="resource_loss"||event.kind==="closure_start")timeline.push({at:event.minute,patientId:"system",hospitalId:event.hospitalId,event:event.kind,status:event.kind==="closure_start"?"closed":"resource_lost"});
  if(log.scenarioNotes.forecasterFallback)timeline.push({at:episode.minute,patientId:"system",event:"forecaster_unavailable",status:"baseline_fallback"});
  if(log.scenarioNotes.duplicateIdempotencyResult)timeline.push({at:episode.minute,patientId:String(log.scenarioNotes.duplicatePatientId),event:"duplicate_request",status:"idempotent",reason:"Existing reservation reused; no duplicate hold created."});
  timeline.sort((a,b)=>a.at-b.at||a.patientId.localeCompare(b.patientId));
  const scenario={id:`S${n}`,name:log.scenario,seed:20261031+n,description:String(log.scenarioNotes.expected??log.scenario),inputs:{day:episode.day.day,minute:episode.minute,patients,hospitals:episode.hospitals,draws:episode.draws,events:episode.day.hiddenEvents,scenarioNotes:log.scenarioNotes},expectedOutcomes:{baseline:log.baseline,modelAware:log.modelAware},patients:patientsOut,hospitals:hospitalOut,timeline,forecastProbabilities:Object.fromEntries(assignment.assignments.map(a=>[a.patientId,a.p_available]))};
  await writeFile(join(outputDir,`S${n}.json`),`${JSON.stringify(scenario,null,2)}\n`);
 }
 console.log("Wrote six scenario JSON files using validation data only.");
}
main().catch((e:unknown)=>{console.error(e);process.exitCode=1});
