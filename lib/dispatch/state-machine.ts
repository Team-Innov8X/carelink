export type DispatchRequestType = "sos" | "normal";
export type DispatchRequestStatus =
  | "created"
  | "offered"
  | "accepted"
  | "en_route_to_patient"
  | "arrived_at_patient"
  | "picked_up"
  | "en_route_to_hospital"
  | "completed"
  | "no_driver_found"
  | "cancelled"
  | "expired";

export type DispatchOfferStatus = "pending" | "accepted" | "declined" | "expired" | "superseded";
export type DispatchActor = { type: "patient" | "driver" | "system"; id: string };

export type DispatchTransition<TStatus extends string> = {
  from: TStatus | null;
  to: TStatus;
  at: Date;
  actor: DispatchActor;
  reason: string;
};

export type DispatchPoint = { lat: number; lng: number; address?: string; accuracyM?: number };
export type DispatchDestination = { hospitalId?: string; lat?: number; lng?: number };

export type DispatchRequest = {
  _id: string;
  patientId: string;
  type: DispatchRequestType;
  status: DispatchRequestStatus;
  pickup: DispatchPoint;
  destination?: DispatchDestination;
  urgency: string;
  notes?: string;
  idempotencyKey: string;
  assignedDriverId?: string;
  createdAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
  cancelledReason?: string;
  transitionLog: DispatchTransition<DispatchRequestStatus>[];
};

export type DispatchOffer = {
  _id: string;
  requestId: string;
  driverId: string;
  round: number;
  status: DispatchOfferStatus;
  expiresAt: Date;
  createdAt: Date;
  respondedAt?: Date;
  transitionLog: DispatchTransition<DispatchOfferStatus>[];
};

export type DriverPresence = {
  driverId: string;
  online: boolean;
  lastLocation?: DispatchPoint;
  lastLocationAt?: Date;
  currentTripId?: string;
};

export type DispatchLocationPing = {
  tripId: string;
  driverId: string;
  lat: number;
  lng: number;
  at: Date;
};

export type DispatchSnapshot = {
  requests: DispatchRequest[];
  offers: DispatchOffer[];
  presence: DriverPresence[];
};

export class DispatchRuleViolation extends Error {
  constructor(readonly rule: "transition" | "idempotency" | "I1" | "I2" | "I3" | "I4" | "I5", message: string) {
    super(message);
    this.name = "DispatchRuleViolation";
  }
}

const ACTIVE_REQUEST_STATUSES = new Set<DispatchRequestStatus>([
  "created", "offered", "accepted", "en_route_to_patient", "arrived_at_patient", "picked_up", "en_route_to_hospital",
]);

const REQUEST_TRANSITIONS: Record<DispatchRequestStatus, readonly DispatchRequestStatus[]> = {
  created: ["offered", "cancelled"],
  offered: ["accepted", "no_driver_found", "cancelled"],
  accepted: ["en_route_to_patient", "cancelled"],
  en_route_to_patient: ["arrived_at_patient", "cancelled"],
  arrived_at_patient: ["picked_up", "cancelled"],
  picked_up: ["en_route_to_hospital", "cancelled"],
  en_route_to_hospital: ["completed", "cancelled"],
  completed: [],
  no_driver_found: [],
  cancelled: [],
  expired: [],
};

const OFFER_TRANSITIONS: Record<DispatchOfferStatus, readonly DispatchOfferStatus[]> = {
  pending: ["accepted", "declined", "expired", "superseded"],
  accepted: [],
  declined: [],
  expired: [],
  superseded: [],
};

type CreateRequestInput = Omit<DispatchRequest, "status" | "transitionLog">;

/** Create once per patient/key; retries return the already-created record unchanged. */
export function createDispatchRequest(input: CreateRequestInput, existing: readonly DispatchRequest[] = []) {
  const key = input.idempotencyKey.trim();
  if (!key) throw new DispatchRuleViolation("idempotency", "An idempotency key is required for every request.");

  const duplicate = existing.find((request) => request.patientId === input.patientId && request.idempotencyKey === key);
  if (duplicate) return { request: duplicate, created: false };

  const request: DispatchRequest = {
    ...input,
    idempotencyKey: key,
    status: "created",
    transitionLog: [{ from: null, to: "created", at: input.createdAt, actor: { type: "patient", id: input.patientId }, reason: "Request created" }],
  };
  return { request, created: true };
}

type CreateOfferInput = Omit<DispatchOffer, "status" | "transitionLog">;

export function createDispatchOffer(input: CreateOfferInput): DispatchOffer {
  if (input.round < 1) throw new DispatchRuleViolation("transition", "Offer rounds start at 1.");
  if (input.expiresAt <= input.createdAt) throw new DispatchRuleViolation("transition", "An offer must expire after it is created.");
  return {
    ...input,
    status: "pending",
    transitionLog: [{ from: null, to: "pending", at: input.createdAt, actor: { type: "system", id: "dispatch" }, reason: "Offer created" }],
  };
}

function validateRequestHistory(request: DispatchRequest): void {
  let current: DispatchRequestStatus | null = null;
  for (const event of request.transitionLog) {
    if (event.from !== current || !isAllowedRequestTransition(request.type, event.from, event.to)) {
      throw new DispatchRuleViolation("I4", `Invalid request transition history for ${request._id}: ${String(event.from)} → ${event.to}.`);
    }
    current = event.to;
  }
  if (current !== request.status) {
    throw new DispatchRuleViolation("I4", `Request ${request._id} status does not match its transition history.`);
  }
}

function validateOfferHistory(offer: DispatchOffer): void {
  let current: DispatchOfferStatus | null = null;
  for (const event of offer.transitionLog) {
    if (event.from !== current || !isAllowedOfferTransition(event.from, event.to)) {
      throw new DispatchRuleViolation("I4", `Invalid offer transition history for ${offer._id}: ${String(event.from)} → ${event.to}.`);
    }
    current = event.to;
  }
  if (current !== offer.status) {
    throw new DispatchRuleViolation("I4", `Offer ${offer._id} status does not match its transition history.`);
  }
}

export function isAllowedRequestTransition(type: DispatchRequestType, from: DispatchRequestStatus | null, to: DispatchRequestStatus): boolean {
  if (from === null) return to === "created";
  if (type === "normal" && (from === "created" || from === "offered") && to === "expired") return true;
  return REQUEST_TRANSITIONS[from].includes(to);
}

export function isAllowedOfferTransition(from: DispatchOfferStatus | null, to: DispatchOfferStatus): boolean {
  if (from === null) return to === "pending";
  return OFFER_TRANSITIONS[from].includes(to);
}

export function transitionDispatchRequest(
  request: DispatchRequest,
  to: DispatchRequestStatus,
  event: Omit<DispatchTransition<DispatchRequestStatus>, "from" | "to">,
): DispatchRequest {
  if (!isAllowedRequestTransition(request.type, request.status, to)) {
    throw new DispatchRuleViolation("transition", `Request cannot transition from ${request.status} to ${to}.`);
  }
  if (to === "accepted" && event.actor.type !== "driver") {
    throw new DispatchRuleViolation("transition", "Only a driver can accept a request.");
  }
  const next: DispatchRequest = {
    ...request,
    status: to,
    ...(to === "accepted" ? { assignedDriverId: event.actor.id, acceptedAt: event.at } : {}),
    ...(to === "completed" ? { completedAt: event.at } : {}),
    ...(to === "cancelled" ? { cancelledReason: event.reason } : {}),
    transitionLog: [...request.transitionLog, { ...event, from: request.status, to }],
  };
  validateRequestHistory(next);
  return next;
}

export function transitionDispatchOffer(
  offer: DispatchOffer,
  to: DispatchOfferStatus,
  event: Omit<DispatchTransition<DispatchOfferStatus>, "from" | "to">,
): DispatchOffer {
  if (!isAllowedOfferTransition(offer.status, to)) {
    throw new DispatchRuleViolation("transition", `Offer cannot transition from ${offer.status} to ${to}.`);
  }
  if (to === "accepted" && event.actor.type !== "driver") {
    throw new DispatchRuleViolation("transition", "Only the offered driver can accept an offer.");
  }
  if (to === "declined" && event.actor.type !== "driver") {
    throw new DispatchRuleViolation("transition", "Only the offered driver can decline an offer.");
  }
  const next: DispatchOffer = {
    ...offer,
    status: to,
    ...(to === "pending" ? {} : { respondedAt: event.at }),
    transitionLog: [...offer.transitionLog, { ...event, from: offer.status, to }],
  };
  validateOfferHistory(next);
  return next;
}

/** Apply one request transition and reject a snapshot that violates I1–I5. */
export function transitionRequestInSnapshot(
  snapshot: DispatchSnapshot,
  requestId: string,
  to: DispatchRequestStatus,
  event: Omit<DispatchTransition<DispatchRequestStatus>, "from" | "to">,
): DispatchSnapshot {
  const requestIndex = snapshot.requests.findIndex((request) => request._id === requestId);
  if (requestIndex < 0) throw new DispatchRuleViolation("transition", `Request ${requestId} was not found.`);
  const requests = [...snapshot.requests];
  requests[requestIndex] = transitionDispatchRequest(requests[requestIndex], to, event);
  const next = { ...snapshot, requests };
  assertDispatchInvariants(next);
  return next;
}

/** Accept one live offer, then supersede all sibling offers as one pure state change. */
export function acceptDispatchOffer(snapshot: DispatchSnapshot, offerId: string, event: Omit<DispatchTransition<DispatchOfferStatus>, "from" | "to">): DispatchSnapshot {
  const offerIndex = snapshot.offers.findIndex((offer) => offer._id === offerId);
  if (offerIndex < 0) throw new DispatchRuleViolation("transition", `Offer ${offerId} was not found.`);
  const offer = snapshot.offers[offerIndex];
  if (offer.expiresAt <= event.at) throw new DispatchRuleViolation("transition", "This offer has expired.");
  if (event.actor.type !== "driver" || event.actor.id !== offer.driverId) {
    throw new DispatchRuleViolation("transition", "Only the driver named on an offer can accept it.");
  }

  const requestIndex = snapshot.requests.findIndex((request) => request._id === offer.requestId);
  if (requestIndex < 0) throw new DispatchRuleViolation("transition", `Request ${offer.requestId} was not found.`);
  const requests = [...snapshot.requests];
  requests[requestIndex] = transitionDispatchRequest(requests[requestIndex], "accepted", event);

  const offers = snapshot.offers.map((current) => {
    if (current._id === offerId) return transitionDispatchOffer(current, "accepted", event);
    if (current.requestId === offer.requestId && current.status === "pending") {
      return transitionDispatchOffer(current, "superseded", { ...event, reason: "Another driver accepted this request" });
    }
    return current;
  });
  const next = { ...snapshot, requests, offers };
  assertDispatchInvariants(next);
  return next;
}

export function assertDispatchInvariants(snapshot: DispatchSnapshot): void {
  for (const request of snapshot.requests) validateRequestHistory(request);
  for (const offer of snapshot.offers) validateOfferHistory(offer);

  const acceptedOfferCounts = new Map<string, number>();
  for (const offer of snapshot.offers) {
    if (offer.status === "accepted") acceptedOfferCounts.set(offer.requestId, (acceptedOfferCounts.get(offer.requestId) ?? 0) + 1);
  }
  if ([...acceptedOfferCounts.values()].some((count) => count > 1)) {
    throw new DispatchRuleViolation("I1", "A request cannot have more than one accepted offer.");
  }

  const activeTripsByDriver = new Map<string, number>();
  for (const request of snapshot.requests) {
    if (ACTIVE_REQUEST_STATUSES.has(request.status) && request.assignedDriverId) {
      activeTripsByDriver.set(request.assignedDriverId, (activeTripsByDriver.get(request.assignedDriverId) ?? 0) + 1);
    }
  }
  if ([...activeTripsByDriver.values()].some((count) => count > 1)) {
    throw new DispatchRuleViolation("I2", "A driver cannot have more than one active trip.");
  }

  const activeSosByPatient = new Map<string, number>();
  for (const request of snapshot.requests) {
    if (request.type === "sos" && ACTIVE_REQUEST_STATUSES.has(request.status)) {
      activeSosByPatient.set(request.patientId, (activeSosByPatient.get(request.patientId) ?? 0) + 1);
    }
  }
  if ([...activeSosByPatient.values()].some((count) => count > 1)) {
    throw new DispatchRuleViolation("I3", "A patient cannot have more than one active SOS request.");
  }

  const tripDriverIds = new Set([...activeTripsByDriver.keys()]);
  const busyDriverIds = new Set(snapshot.presence.filter((driver) => driver.currentTripId).map((driver) => driver.driverId));
  for (const offer of snapshot.offers) {
    if (offer.status === "pending" && (tripDriverIds.has(offer.driverId) || busyDriverIds.has(offer.driverId))) {
      throw new DispatchRuleViolation("I5", `Driver ${offer.driverId} is already on a trip and cannot receive another offer.`);
    }
  }
}
