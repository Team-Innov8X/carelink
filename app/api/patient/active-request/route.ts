import { requireRole } from "@/lib/auth-utils";
import { advanceDispatch, sosCollections } from "@/lib/sos";
import { getUsersCollection } from "@/lib/models/db";
import { distanceKm, validCoordinates, workflowCollections } from "@/lib/sos";
import { EMERGENCY_FALLBACK_TEXT, POLL_SECONDS, SOS_SEARCH_RADIUS_KM, STALE_LOCATION_SECONDS } from "@/lib/dispatch/constants";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole("patient");
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { requests, drivers, offers } = await sosCollections();
  const pendingSos = await requests.findOne({ patientId: auth.user.id, status: "searching", type: { $ne: "normal" } }, { sort: { createdAt: -1 }, projection: { _id: 1 } });
  if (pendingSos) await advanceDispatch(pendingSos._id);
  let item = await requests.findOne({
    patientId: auth.user.id,
    status: { $in: ["searching", "accepted", "no_driver_found", "cancelled", "completed", "expired"] },
  }, { sort: { createdAt: -1 } });
  if (item?.status === "no_driver_found" && item.type !== "normal" && validCoordinates(item.location) && Date.now() - new Date(item.createdAt).getTime() <= 10 * 60_000) {
    const activeRequest = await requests.findOne({ patientId: auth.user.id, status: { $in: ["searching", "accepted"] }, type: { $ne: "normal" }, _id: { $ne: item._id } }, { projection: { _id: 1 } });
    if (!activeRequest) {
      const freshDrivers = await drivers.find({ available: true, activeRequestId: { $exists: false }, currentTripId: { $in: [null] }, location: { $exists: true }, locationUpdatedAt: { $gte: new Date(Date.now() - STALE_LOCATION_SECONDS * 1000) } }).project({ location: 1 }).toArray();
      const hasEligibleDriver = freshDrivers.some((driver) => validCoordinates(driver.location) && distanceKm(item!.location, driver.location!) <= SOS_SEARCH_RADIUS_KM);
      if (hasEligibleDriver) {
        const now = new Date();
        const previousOffers = await offers.find({ requestId: item._id }).project({ round: 1 }).toArray();
        const lastRound = previousOffers.reduce((max, offer) => Math.max(max, offer.round ?? 0), 0);
        try {
          const reopened = await requests.updateOne({ _id: item._id, status: "no_driver_found" }, {
            $set: { status: "searching", dispatchStatus: "created", dispatchRound: lastRound, dispatchRoundAt: now, dispatchReopenedAt: now, activePatientId: auth.user.id },
            $unset: { noDriverFoundAt: "", assignedDriverId: "", assignmentExpiresAt: "" },
            $push: { transitionLog: { from: "no_driver_found", to: "searching", at: now, actor: { type: "system", id: "dispatch" }, reason: "A nearby available driver came online" } },
          });
          if (reopened.modifiedCount) {
            await advanceDispatch(item._id);
            item = await requests.findOne({ _id: item._id });
          }
        } catch { /* A concurrent active request takes precedence over reopening this one. */ }
      }
    }
  }
  if (!item) return Response.json({ request: null, serverTime: new Date().toISOString(), pollSeconds: POLL_SECONDS, staleLocationSeconds: STALE_LOCATION_SECONDS });
  const nearbyAvailableDriverCount = item.status === "searching" && validCoordinates(item.location)
    ? (await drivers.find({
        available: true,
        activeRequestId: { $exists: false },
        currentTripId: { $in: [null] },
        location: { $exists: true },
        locationUpdatedAt: { $gte: new Date(Date.now() - STALE_LOCATION_SECONDS * 1000) },
      }).project({ location: 1 }).toArray()).filter((driver) =>
        validCoordinates(driver.location) && distanceKm(item.location, driver.location) <= SOS_SEARCH_RADIUS_KM,
      ).length
    : 0;
  const accepted = item.status === "accepted" && Boolean(item.driverId);
  const assignedDriverId = accepted ? item.driverId : undefined;
  const driver = assignedDriverId
    ? await drivers.findOne({ userId: assignedDriverId }, { projection: { userId: 1, location: 1, locationUpdatedAt: 1, vehicleNumber: 1, ambulanceId: 1 } })
    : null;
  const profile = assignedDriverId ? await (await getUsersCollection()).findOne({ id: assignedDriverId }, { projection: { id: 1, name: 1, phone: 1 } }) : null;
  const driverLocation = accepted && validCoordinates(driver?.location) ? driver.location : null;
  const destinationRequest = item.destination ?? null;
  const { hospitalRequests } = await workflowCollections();
  const hospitalRequest = accepted ? await hospitalRequests.findOne({ sosRequestId: item._id }) : null;
  const hospitalDirectory = hospitalRequest
    ? await (await clientPromise).db().collection<{ _id: string | ObjectId; location?: unknown }>("hospitals").findOne({ _id: ObjectId.isValid(hospitalRequest.hospitalId) ? new ObjectId(hospitalRequest.hospitalId) : hospitalRequest.hospitalId })
    : null;
  const rawHospitalLocation = hospitalDirectory?.location as { latitude?: unknown; longitude?: unknown; coordinates?: unknown } | undefined;
  const hospitalLocation = item.recommendation?.selectedHospitalLocation ?? (rawHospitalLocation && typeof rawHospitalLocation.latitude === "number" && typeof rawHospitalLocation.longitude === "number"
    ? { latitude: rawHospitalLocation.latitude, longitude: rawHospitalLocation.longitude }
    : rawHospitalLocation && Array.isArray(rawHospitalLocation.coordinates) && typeof rawHospitalLocation.coordinates[0] === "number" && typeof rawHospitalLocation.coordinates[1] === "number"
      ? { latitude: rawHospitalLocation.coordinates[1], longitude: rawHospitalLocation.coordinates[0] }
      : undefined);
  const tripStage = accepted ? item.tripStage ?? "accepted" : null;
  const target = tripStage === "patient_on_board" || tripStage === "en_route_hospital" || tripStage === "arrived_hospital" ? hospitalLocation ?? item.location : item.location;
  const etaDistance = driverLocation && target ? distanceKm(driverLocation, target) : null;
  const etaMinutes = etaDistance === null ? null : Math.max(1, Math.ceil(etaDistance * 2.5)) + (item.issue?.etaDelayMinutes ?? 0);
  const destination = item.recommendation?.selectedHospitalId
    ? { name: item.recommendation.selectedHospitalName ?? "Recommended hospital", status: item.recommendation.status === "confirmed" ? "accepted" : item.recommendation.status === "unserved" ? "rejected" : "pending", bedCategory: item.recommendation.conditionId ? "bed" : undefined, location: hospitalLocation }
    : hospitalRequest
    ? { name: hospitalRequest.hospitalName, status: hospitalRequest.status, bedCategory: hospitalRequest.bedCategory, location: hospitalLocation }
    : destinationRequest ? { name: destinationRequest.name ?? "Destination", status: "pending", location: validCoordinates(destinationRequest) ? destinationRequest : undefined } : null;
  return Response.json({ request: {
    id: item._id,
    type: item.type ?? (item.requestType === "routine" ? "normal" : "sos"),
    status: item.status,
    incidentType: item.incidentType,
    location: item.location,
    destination,
    recommendation: item.recommendation ?? null,
    urgency: item.urgency ?? null,
    notes: item.notes ?? null,
    createdAt: item.createdAt,
    acceptedAt: accepted ? item.acceptedAt : null,
    tripStage,
    dispatchStatus: item.dispatchStatus ?? (accepted ? "accepted" : item.status),
    tripTimestamps: accepted ? item.tripTimestamps ?? {} : {},
    arrivedAt: accepted ? item.arrivedAt ?? null : null,
    completedAt: item.completedAt ?? null,
    cancelledAt: (item as typeof item & { cancelledAt?: Date }).cancelledAt ?? null,
    fallbackInstruction: item.status === "no_driver_found" ? EMERGENCY_FALLBACK_TEXT : null,
    nearbyAvailableDriverCount,
    estimatedEtaMinutes: accepted ? etaMinutes : null,
    distanceKm: accepted && driverLocation ? Number(distanceKm(driverLocation, item.location).toFixed(1)) : null,
    serverTime: new Date().toISOString(),
    pollSeconds: POLL_SECONDS,
    staleLocationSeconds: STALE_LOCATION_SECONDS,
    driver: accepted ? {
      id: item.driverId,
      name: profile?.name ?? null,
      phone: profile?.phone ?? null,
      vehicleNumber: driver?.vehicleNumber ?? driver?.ambulanceId ?? null,
      location: driverLocation,
      locationUpdatedAt: driver?.locationUpdatedAt ?? null,
      accuracyM: (driver as typeof driver & { locationAccuracyM?: number } | null)?.locationAccuracyM ?? null,
    } : null,
  } });
}
