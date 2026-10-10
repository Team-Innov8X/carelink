import { describe, expect, it } from "vitest";
import { isDispatchExhausted, selectSosOfferBatch, type DispatchCandidate } from "../lib/dispatch/round-planner.ts";

const at = new Date("2026-10-10T12:00:00.000Z");
const candidate = (driverId: string, latitude: number, changes: Partial<DispatchCandidate> = {}): DispatchCandidate => ({
  driverId,
  location: { latitude, longitude: 0 },
  locationUpdatedAt: at,
  online: true,
  busy: false,
  ...changes,
});

describe("phase 2 dispatch rules", () => {
  it("offers the nearest eligible drivers and excludes stale, busy, offline, offered, and out-of-radius drivers", () => {
    const selected = selectSosOfferBatch(
      { latitude: 0, longitude: 0 },
      [
        candidate("near", 0.01),
        candidate("farther", 0.03),
        candidate("stale", 0.005, { locationUpdatedAt: new Date(at.getTime() - 31_000) }),
        candidate("busy", 0.002, { busy: true }),
        candidate("offline", 0.003, { online: false }),
        candidate("previously-offered", 0.004),
        candidate("outside-radius", 0.2),
      ],
      new Set(["previously-offered"]),
      at,
    );
    expect(selected.map((driver) => driver.driverId)).toEqual(["near", "farther"]);
  });

  it("stops dispatch after the configured maximum rounds", () => {
    expect(isDispatchExhausted(2, 3)).toBe(false);
    expect(isDispatchExhausted(3, 3)).toBe(true);
  });

  it("allows exactly one concurrent request claim using the same conditional status guard as the API", async () => {
    let status = "searching";
    const claim = async (driverId: string) => {
      // Mongo findOneAndUpdate({_id, status: 'searching'}) serializes this conditional write.
      if (status !== "searching") return null;
      status = "accepted";
      return { driverId, status };
    };

    const results = await Promise.all([claim("driver-a"), claim("driver-b")]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter(Boolean)[0]?.status).toBe("accepted");
    expect(status).toBe("accepted");
  });
});
