import { describe, expect, it } from "vitest";
import {
  acceptDispatchOffer,
  assertDispatchInvariants,
  createDispatchOffer,
  createDispatchRequest,
  DispatchRuleViolation,
  isAllowedOfferTransition,
  isAllowedRequestTransition,
  transitionDispatchOffer,
  transitionDispatchRequest,
  type DispatchOffer,
  type DispatchRequest,
  type DispatchSnapshot,
} from "../lib/dispatch/state-machine.ts";

const now = new Date("2026-10-10T12:00:00Z");
const event = (type: "patient" | "driver" | "system" = "system", id = "sys") => ({
  at: new Date(now.getTime() + 1_000), actor: { type, id }, reason: "test transition",
});

function request(overrides: Partial<DispatchRequest> = {}): DispatchRequest {
  const created = createDispatchRequest({
    _id: "r1", patientId: "p1", type: "sos", pickup: { lat: 1, lng: 2 }, urgency: "urgent",
    idempotencyKey: "key-1", createdAt: now,
  }).request;
  return { ...created, ...overrides };
}

function offer(id = "o1", requestId = "r1", driverId = "d1", overrides: Partial<DispatchOffer> = {}): DispatchOffer {
  return createDispatchOffer({
    _id: id, requestId, driverId, round: 1, createdAt: now,
    expiresAt: new Date(now.getTime() + 10_000), ...overrides,
  });
}

function snapshot(requests: DispatchRequest[], offers: DispatchOffer[] = [], presence: DispatchSnapshot["presence"] = []): DispatchSnapshot {
  return { requests, offers, presence };
}

describe("dispatch state machine", () => {
  it("allows only the documented request and offer edges", () => {
    const requestEdges: [DispatchRequest["type"], DispatchRequest["status"], DispatchRequest["status"]][] = [
      ["sos", "created", "offered"], ["sos", "offered", "accepted"],
      ["sos", "accepted", "en_route_to_patient"], ["sos", "en_route_to_patient", "arrived_at_patient"],
      ["sos", "arrived_at_patient", "picked_up"], ["sos", "picked_up", "en_route_to_hospital"],
      ["sos", "en_route_to_hospital", "completed"], ["sos", "offered", "no_driver_found"],
      ["normal", "created", "expired"], ["normal", "offered", "expired"],
      ...(["created", "offered", "accepted", "en_route_to_patient", "arrived_at_patient", "picked_up", "en_route_to_hospital"] as const)
        .map((status) => ["sos", status, "cancelled"] as ["sos", DispatchRequest["status"], "cancelled"]),
    ];
    for (const [type, from, to] of requestEdges) expect(isAllowedRequestTransition(type, from, to)).toBe(true);
    expect(isAllowedRequestTransition("sos", "created", "expired")).toBe(false);
    expect(isAllowedRequestTransition("sos", "accepted", "no_driver_found")).toBe(false);
    expect(isAllowedRequestTransition("normal", "created", "accepted")).toBe(false);
    expect(isAllowedRequestTransition("sos", "completed", "cancelled")).toBe(false);
    expect(isAllowedOfferTransition(null, "pending")).toBe(true);
    for (const final of ["accepted", "declined", "expired", "superseded"] as const) {
      expect(isAllowedOfferTransition("pending", final)).toBe(true);
      expect(isAllowedOfferTransition(final, "pending")).toBe(false);
    }
  });

  it("records transitions and rejects forbidden transitions or actors", () => {
    const created = request();
    const offered = transitionDispatchRequest(created, "offered", event());
    expect(offered.transitionLog.at(-1)?.from).toBe("created");
    expect(() => transitionDispatchRequest(offered, "accepted", event("patient", "p1")))
      .toThrow("Only a driver can accept");
    expect(() => transitionDispatchRequest(created, "completed", event())).toThrow(DispatchRuleViolation);
    expect(() => transitionDispatchOffer(offer(), "declined", event("system"))).toThrow("Only the offered driver");
  });

  it("returns an existing request for the same patient and idempotency key", () => {
    const first = createDispatchRequest({
      _id: "r1", patientId: "p1", type: "sos", pickup: { lat: 1, lng: 2 }, urgency: "urgent",
      idempotencyKey: " key-1 ", createdAt: now,
    });
    const retry = createDispatchRequest({
      _id: "r2", patientId: "p1", type: "normal", pickup: { lat: 8, lng: 9 }, urgency: "low",
      idempotencyKey: "key-1", createdAt: new Date(now.getTime() + 2_000),
    }, [first.request]);
    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(retry.request).toBe(first.request);
    expect(createDispatchRequest({
      _id: "r3", patientId: "p2", type: "sos", pickup: { lat: 1, lng: 2 }, urgency: "urgent",
      idempotencyKey: "key-1", createdAt: now,
    }, [first.request]).created).toBe(true);
    expect(() => createDispatchRequest({
      _id: "r4", patientId: "p1", type: "sos", pickup: { lat: 1, lng: 2 }, urgency: "urgent",
      idempotencyKey: "  ", createdAt: now,
    })).toThrow("idempotency key is required");
  });

  it("accepts one offer and supersedes pending siblings", () => {
    const req = transitionDispatchRequest(request(), "offered", event());
    const result = acceptDispatchOffer(snapshot([req], [offer("o1", "r1", "d1"), offer("o2", "r1", "d2")]), "o1", event("driver", "d1"));
    expect(result.requests[0].status).toBe("accepted");
    expect(result.requests[0].assignedDriverId).toBe("d1");
    expect(result.offers.map((item) => item.status)).toEqual(["accepted", "superseded"]);
    expect(() => acceptDispatchOffer(snapshot([req], [offer("o1", "r1", "d1")]), "o1", event("driver", "d2")))
      .toThrow("Only the driver named on an offer");
    const expired = { ...offer("o3", "r1", "d3"), expiresAt: now };
    expect(() => acceptDispatchOffer(snapshot([req], [expired]), "o3", event("driver", "d3"))).toThrow("offer has expired");
  });

  it("checks I1 through I5", () => {
    const accepted = transitionDispatchRequest(
      transitionDispatchRequest(request(), "offered", event()), "accepted", event("driver", "d1"),
    );
    const acceptedOffer = transitionDispatchOffer(offer(), "accepted", event("driver", "d1"));
    const otherAcceptedOffer = transitionDispatchOffer(offer("o2", "r1", "d2"), "accepted", event("driver", "d2"));
    expect(() => assertDispatchInvariants(snapshot([accepted], [acceptedOffer, otherAcceptedOffer])))
      .toThrow("A request cannot have more than one accepted offer.");

    const secondActiveTrip = transitionDispatchRequest(
      transitionDispatchRequest(request({ _id: "r2", patientId: "p2", idempotencyKey: "key-2" }), "offered", event()),
      "accepted", event("driver", "d1"),
    );
    expect(() => assertDispatchInvariants(snapshot([accepted, secondActiveTrip], [acceptedOffer])))
      .toThrow("A driver cannot have more than one active trip.");
    const secondSos = request({ _id: "r2", idempotencyKey: "key-2" });
    expect(() => assertDispatchInvariants(snapshot([request(), secondSos])))
      .toThrow("A patient cannot have more than one active SOS request.");
    expect(() => assertDispatchInvariants(snapshot([request({ status: "offered" })])))
      .toThrow("status does not match its transition history");
    expect(() => assertDispatchInvariants(snapshot([request()], [offer()], [{ driverId: "d1", online: true, currentTripId: "other" }])))
      .toThrow("is already on a trip and cannot receive another offer");
    expect(() => assertDispatchInvariants(snapshot([request()]))).not.toThrow();
  });
});
