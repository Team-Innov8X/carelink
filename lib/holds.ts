import { ObjectId, type Filter } from "mongodb";
import { getHoldsCollection, getHospitalsCollection } from "@/lib/models/db";
import { HOLD_DURATION_MS, type IHold, type HoldCloseReason } from "@/lib/models/hold";
import type { IHospital } from "@/lib/models/hospital";

const ACTIVE = ["queued", "pending", "confirmed"] as const;
const idFilter = (id: string) => (ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id }) as Filter<IHospital>;
const expiryTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; expiresAt: number }>();

function scheduleExpiry(hospitalId: string, expiresAt: Date) {
  const expiresAtMs = expiresAt.getTime();
  const previous = expiryTimers.get(hospitalId);
  if (previous && previous.expiresAt <= expiresAtMs) return;
  if (previous) clearTimeout(previous.timer);
  const delay = Math.max(0, expiresAtMs - Date.now());
  const timer = setTimeout(() => {
    expiryTimers.delete(hospitalId);
    void expireDueRequests(hospitalId).catch((error) => console.error("Failed to expire bed request", error));
  }, delay);
  expiryTimers.set(hospitalId, { timer, expiresAt: expiresAtMs });
}

async function initializeHospitalCounters(hospitalId: string) {
  const hospitals = await getHospitalsCollection();
  const holds = await getHoldsCollection();
  const hospitalFilter = idFilter(hospitalId);
  const hospital = await hospitals.findOne(hospitalFilter);
  if (!hospital) return null;
  const counters = hospital as unknown as Record<string, unknown>;
  if (typeof counters.bedClaims !== "number") {
    const existingClaims = await holds.countDocuments({ hospitalId, status: { $in: ["pending", "confirmed"] } });
    await hospitals.updateOne({ ...hospitalFilter, bedClaims: { $exists: false } } as Filter<IHospital>, {
      $set: { bedClaims: existingClaims, requestSeq: 0 },
    });
  } else if (typeof counters.requestSeq !== "number") {
    await hospitals.updateOne({ ...hospitalFilter, requestSeq: { $exists: false } } as Filter<IHospital>, { $set: { requestSeq: 0 } });
  }
  return hospitals.findOne(hospitalFilter);
}

async function allocateRequestSlot(hospitalId: string): Promise<{ seq: number; pending: boolean } | null> {
  const hospitals = await getHospitalsCollection();
  const hospital = await initializeHospitalCounters(hospitalId);
  if (!hospital) return null;
  const totalBeds = ((hospital as unknown as { capacitySummary?: { totalBeds?: number } }).capacitySummary?.totalBeds) ?? 0;
  if (totalBeds > 0) {
    const claimed = await hospitals.findOneAndUpdate({
      ...idFilter(hospitalId),
      $expr: { $lt: [{ $ifNull: ["$bedClaims", 0] }, totalBeds] },
    } as Filter<IHospital>, { $inc: { requestSeq: 1, bedClaims: 1 } }, { returnDocument: "after" });
    if (claimed) return { seq: (claimed as unknown as { requestSeq: number }).requestSeq, pending: true };
  }
  const queued = await hospitals.findOneAndUpdate(idFilter(hospitalId), { $inc: { requestSeq: 1 } }, { returnDocument: "after" });
  if (!queued) return null;
  return { seq: (queued as unknown as { requestSeq: number }).requestSeq, pending: false };
}

export async function claimBed(hospitalId: string): Promise<boolean> {
  const hospitals = await getHospitalsCollection();
  const hospital = await initializeHospitalCounters(hospitalId);
  if (!hospital) return false;
  const capacity = (hospital as Record<string, unknown>).capacitySummary as { totalBeds?: number } | undefined;
  const totalBeds = capacity?.totalBeds;
  if (typeof totalBeds !== "number" || totalBeds < 1) return false;
  const result = await hospitals.findOneAndUpdate({
    ...idFilter(hospitalId),
    $expr: { $lt: [{ $ifNull: ["$bedClaims", 0] }, totalBeds] },
  } as Filter<IHospital>, { $inc: { bedClaims: 1 } }, { returnDocument: "after" });
  return Boolean(result);
}

export async function releaseBed(hospitalId: string) {
  const hospitals = await getHospitalsCollection();
  await hospitals.updateOne({ ...idFilter(hospitalId), bedClaims: { $gt: 0 } } as Filter<IHospital>, { $inc: { bedClaims: -1 } });
}

export async function promoteNext(hospitalId: string) {
  const holds = await getHoldsCollection();
  const hospital = await initializeHospitalCounters(hospitalId);
  if (!hospital || !(await claimBed(hospitalId))) return null;
  const now = new Date();
  const next = await holds.findOneAndUpdate(
    { hospitalId, status: "queued" },
    { $set: { status: "pending", expiresAt: new Date(now.getTime() + HOLD_DURATION_MS), updatedAt: now }, $unset: { position: "" } },
    { sort: { seq: 1 }, returnDocument: "after" },
  );
  if (!next) {
    await releaseBed(hospitalId);
    return null;
  }
  scheduleExpiry(hospitalId, next.expiresAt!);
  return next;
}

async function closeQueuedWithoutBeds(hospitalId: string) {
  const hospitals = await getHospitalsCollection();
  const holds = await getHoldsCollection();
  const hospital = await hospitals.findOne(idFilter(hospitalId));
  const totalBeds = ((hospital as unknown as { capacitySummary?: { totalBeds?: number } })?.capacitySummary?.totalBeds) ?? 0;
  const confirmed = await holds.countDocuments({ hospitalId, status: "confirmed" });
  if (totalBeds > 0 && confirmed >= totalBeds) {
    await holds.updateMany({ hospitalId, status: "queued" }, { $set: { status: "rejected", reason: "no_beds", updatedAt: new Date() }, $unset: { position: "" } });
  }
}

export async function expireDueRequests(hospitalId?: string) {
  const holds = await getHoldsCollection();
  const due = await holds.find({ status: "pending", expiresAt: { $lte: new Date() }, ...(hospitalId ? { hospitalId } : {}) }).toArray();
  for (const hold of due) {
    const result = await holds.updateOne({ _id: hold._id, status: "pending", expiresAt: { $lte: new Date() } }, { $set: { status: "expired", reason: "expired", updatedAt: new Date() } });
    if (result.modifiedCount) {
      await releaseBed(hold.hospitalId);
      await promoteNext(hold.hospitalId);
    }
  }
  if (hospitalId) {
    const next = await holds.findOne({ hospitalId, status: "pending", expiresAt: { $exists: true } }, { sort: { expiresAt: 1 } });
    if (next?.expiresAt) scheduleExpiry(hospitalId, next.expiresAt);
  }
}

export async function createBedRequest(input: { hospitalId: string; patientId: string; patientDetails?: IHold["patientDetails"] }) {
  const holds = await getHoldsCollection();
  const hospital = await initializeHospitalCounters(input.hospitalId);
  if (!hospital) return { error: "HOSPITAL_NOT_FOUND" as const };
  await expireDueRequests(input.hospitalId);
  const allocation = await allocateRequestSlot(input.hospitalId);
  if (!allocation) return { error: "HOSPITAL_NOT_FOUND" as const };
  const now = new Date();
  const { seq, pending } = allocation;
  const activeQueueCount = await holds.countDocuments({ hospitalId: input.hospitalId, status: "queued" });
  const hold: IHold = {
    hospitalId: input.hospitalId, patientId: input.patientId, requestedByUserId: input.patientId,
    seq, status: pending ? "pending" : "queued", ...(pending ? { expiresAt: new Date(now.getTime() + HOLD_DURATION_MS) } : { position: activeQueueCount + 1 }),
    ...(input.patientDetails ? { patientDetails: input.patientDetails } : {}), createdAt: now, updatedAt: now,
  };
  try {
    const inserted = await holds.insertOne(hold);
    if (pending) scheduleExpiry(input.hospitalId, hold.expiresAt!);
    return { hold: { ...hold, _id: inserted.insertedId } };
  } catch (error) {
    if (pending) await releaseBed(input.hospitalId);
    throw error;
  }
}

export async function transitionRequest(id: string, hospitalId: string, action: "cancel" | "reject" | "confirm", patientId?: string) {
  const holds = await getHoldsCollection();
  const filter: Record<string, unknown> = { _id: ObjectId.isValid(id) ? new ObjectId(id) : id, status: action === "cancel" ? { $in: ACTIVE } : "pending" };
  if (hospitalId) filter.hospitalId = hospitalId;
  if (patientId) filter.patientId = patientId;
  const now = new Date();
  if (action === "confirm") {
    const result = await holds.findOneAndUpdate(filter as Filter<IHold>, { $set: { status: "confirmed", confirmedAt: now, updatedAt: now }, $unset: { expiresAt: "" } }, { returnDocument: "after" });
    if (!result) return null;
    const others = await holds.find({ patientId: result.patientId, hospitalId: { $ne: hospitalId }, status: { $in: ACTIVE } }).toArray();
    for (const other of others) {
      const closed = await holds.updateOne({ _id: other._id, status: { $in: ACTIVE } }, { $set: { status: "cancelled", reason: "cancelled", updatedAt: now } });
      if (closed.modifiedCount && other.status !== "queued") await releaseBed(other.hospitalId);
      if (closed.modifiedCount) await promoteNext(other.hospitalId);
    }
    await closeQueuedWithoutBeds(hospitalId);
    return result;
  }
  const status = action === "cancel" ? "cancelled" : "rejected";
  const result = await holds.findOneAndUpdate(filter as Filter<IHold>, { $set: { status, reason: status as HoldCloseReason, updatedAt: now } }, { returnDocument: "before" });
  if (!result) return null;
  const releaseHospitalId = hospitalId || result.hospitalId;
  if (result.status !== "queued") await releaseBed(releaseHospitalId);
  await promoteNext(releaseHospitalId);
  return result;
}
