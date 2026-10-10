import type { AllocationHospital, Reservation, ReservationStatus, SimResourceType } from "./types.ts";

const ACTIVE = new Set<ReservationStatus>(["requested", "confirmed", "arrived"]);
const ALLOWED: Record<ReservationStatus, ReservationStatus[]> = {
  proposed: ["requested", "cancelled"],
  requested: ["confirmed", "rejected", "expired", "cancelled"],
  confirmed: ["arrived", "lost", "cancelled"],
  arrived: ["handed_over", "arrival_failed", "cancelled"],
  handed_over: [], rejected: [], expired: [], lost: [], arrival_failed: [], cancelled: [],
};

/** Deterministic in-memory simulation ledger. Capacity is derived from reservation ids. */
export class ReservationLedger {
  private readonly reservationsById = new Map<string, Reservation>();
  private readonly idempotency = new Map<string, string>();
  private readonly capacity = new Map<string, number>();
  private readonly closures = new Set<string>();
  private readonly patientRequirements = new Map<string, SimResourceType>();
  private nextId = 1;

  constructor(hospitals: AllocationHospital[]) {
    for (const hospital of hospitals) for (const type of ["icu_bed", "emergency_bed"] as const) {
      this.capacity.set(this.key(hospital.id, type), hospital.closedTypes.includes(type) ? 0 : hospital.confirmedFree[type]);
      if (hospital.closedTypes.includes(type)) this.closures.add(this.key(hospital.id, type));
    }
    this.assertInvariants();
  }

  private key(hospitalId: string, type: SimResourceType) { return `${hospitalId}\0${type}`; }
  private active(reservation: Reservation) { return ACTIVE.has(reservation.status); }
  get reservations(): Reservation[] { return [...this.reservationsById.values()]; }
  getActiveReservations() { return this.reservations.filter((reservation) => this.active(reservation)); }
  freeUnits(hospitalId: string, type: SimResourceType) {
    const used = this.getActiveReservations().filter((reservation) => reservation.hospitalId === hospitalId && reservation.resourceType === type).length;
    return Math.max(0, (this.capacity.get(this.key(hospitalId, type)) ?? 0) - used);
  }

  reserve(input: { patientId: string; batchId: string; hospitalId: string; resourceType: SimResourceType; requiredResourceType: SimResourceType; at?: number }): { reservation: Reservation; created: boolean } | null {
    if (input.resourceType !== input.requiredResourceType) throw new Error("I4: reservation resource type differs from patient requirement.");
    const dedupeKey = `${input.patientId}\0${input.batchId}`;
    const knownId = this.idempotency.get(dedupeKey);
    if (knownId && this.active(this.reservationsById.get(knownId)!)) return { reservation: this.reservationsById.get(knownId)!, created: false };
    if (this.getActiveReservations().some((item) => item.patientId === input.patientId)) return null;
    const key = this.key(input.hospitalId, input.resourceType);
    if (this.closures.has(key) || this.freeUnits(input.hospitalId, input.resourceType) < 1) return null;
    const at = input.at ?? 0;
    const id = `sim-hold-${this.nextId++}`;
    const reservation: Reservation = {
      id, patientId: input.patientId, batchId: input.batchId, hospitalId: input.hospitalId,
      resourceType: input.resourceType, status: "proposed", createdAt: at,
      history: [{ from: null, to: "proposed", at, actor: "engine", reason: "feasible allocation selected" }],
    };
    this.patientRequirements.set(`${input.patientId}\0${input.batchId}`, input.requiredResourceType);
    this.reservationsById.set(id, reservation);
    this.idempotency.set(dedupeKey, id);
    this.transition(id, "requested", at, "engine", "simulation hold requested");
    return { reservation, created: true };
  }

  transition(id: string, to: ReservationStatus, at: number, actor: string, reason: string): Reservation {
    const reservation = this.reservationsById.get(id);
    if (!reservation) throw new Error(`Unknown reservation ${id}.`);
    if (!ALLOWED[reservation.status].includes(to)) throw new Error(`Invalid reservation transition ${reservation.status} -> ${to}.`);
    const from = reservation.status;
    reservation.status = to;
    reservation.history.push({ from, to, at, actor, reason });
    this.assertInvariants();
    return reservation;
  }

  getConfirmedFree(hospitalId: string, type: SimResourceType) { return this.capacity.get(this.key(hospitalId, type)) ?? 0; }
  isClosed(hospitalId: string, type: SimResourceType) { return this.closures.has(this.key(hospitalId, type)); }

  setClosed(hospitalId: string, type: SimResourceType, closed: boolean, at = 0) {
    const key = this.key(hospitalId, type);
    if (closed) {
      for (const reservation of this.getActiveReservations().filter((item) => item.hospitalId === hospitalId && item.resourceType === type)) {
        const terminal = reservation.status === "requested" ? "cancelled" : reservation.status === "arrived" ? "arrival_failed" : "lost";
        this.transition(reservation.id, terminal, at, "event", "resource type closed");
      }
      this.closures.add(key);
      this.capacity.set(key, 0);
    } else {
      this.closures.delete(key);
    }
    this.assertInvariants();
  }

  setConfirmedFree(hospitalId: string, type: SimResourceType, units: number, at = 0) {
    if (!Number.isInteger(units) || units < 0) throw new RangeError("Confirmed free capacity must be a non-negative integer.");
    const key = this.key(hospitalId, type);
    while (this.getActiveReservations().filter((item) => item.hospitalId === hospitalId && item.resourceType === type).length > units) {
      const reservation = this.getActiveReservations().find((item) => item.hospitalId === hospitalId && item.resourceType === type)!;
      const terminal = reservation.status === "requested" ? "cancelled" : reservation.status === "arrived" ? "arrival_failed" : "lost";
      this.transition(reservation.id, terminal, at, "event", "confirmed resource loss");
    }
    this.capacity.set(key, units);
    this.assertInvariants();
  }

  assertInvariants() {
    const active = this.getActiveReservations();
    const usage = new Map<string, number>();
    const patients = new Set<string>();
    for (const reservation of active) {
      const key = this.key(reservation.hospitalId, reservation.resourceType);
      usage.set(key, (usage.get(key) ?? 0) + 1);
      const patientKey = reservation.patientId;
      if (patients.has(patientKey)) throw new Error("I2: patient has multiple active reservations.");
      patients.add(patientKey);
      if (!this.capacity.has(key)) throw new Error("I1: reservation has no confirmed capacity record.");
      if (this.closures.has(key)) throw new Error("I5: active reservation exists at a closed hospital/type.");
      const history = reservation.history;
      if (!history.length || history[0].to !== "proposed") throw new Error("I6: reservation history must begin at proposed.");
      for (let index = 1; index < history.length; index += 1) {
        if (history[index].from !== history[index - 1].to || !ALLOWED[history[index - 1].to].includes(history[index].to)) throw new Error("I6: invalid transition history.");
      }
    }
    for (const [key, count] of usage) if (count > (this.capacity.get(key) ?? 0)) throw new Error("I1: active reservations exceed confirmed free capacity.");
    // I3: all usage above is computed from unique reservation ids in the canonical map.
    if (new Set(this.reservations.map((item) => item.id)).size !== this.reservationsById.size) throw new Error("I3: reservation counted more than once.");
    // I4: reservation resource types are validated against each patient's immutable requirement at create time;
    // reject inconsistent keys or malformed resource types if state is ever corrupted.
    for (const item of this.reservations) {
      if (item.resourceType !== "icu_bed" && item.resourceType !== "emergency_bed") throw new Error("I4: unsupported resource type.");
      if (this.patientRequirements.get(`${item.patientId}\0${item.batchId}`) !== item.resourceType) throw new Error("I4: reservation resource type differs from patient requirement.");
    }
  }
}
