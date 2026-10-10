import { requireRole } from "@/lib/auth-utils";
import { advanceDispatch, sosCollections } from "@/lib/sos";
import { getUsersCollection } from "@/lib/models/db";
import { distanceKm, validCoordinates, workflowCollections } from "@/lib/sos";
import { EMERGENCY_FALLBACK_TEXT, POLL_SECONDS, STALE_LOCATION_SECONDS } from "@/lib/dispatch/constants";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole("patient");
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  const { requests, drivers } = await sosCollections();
  const pendingSos = await requests.findOne({ patientId: auth.user.id, status: "searching", type: { $ne: "normal" } }, { sort: { createdAt: -1 }, projection: { _id: 1 } });
  if (pendingSos) await advanceDispatch(pendingSos._id);
  const item = await requests.findOne({
    patientId: auth.user.id,
    status: { $in: ["searching", "accepted", "no_driver_found", "cancelled", "completed", "expired"] },
  }, { sort: { createdAt: -1 } });
  if (!item) return Response.json({ request: null, serverTime: new Date().toISOString(), pollSeconds: POLL_SECONDS, staleLocationSeconds: STALE_LOCATION_SECONDS });
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
  const hospitalLocation = rawHospitalLocation && typeof rawHospitalLocation.latitude === "number" && typeof rawHospitalLocation.longitude === "number"
    ? { latitude: rawHospitalLocation.latitude, longitude: rawHospitalLocation.longitude }
    : rawHospitalLocation && Array.isArray(rawHospitalLocation.coordinates) && typeof rawHospitalLocation.coordinates[0] === "number" && typeof rawHospitalLocation.coordinates[1] === "number"
      ? { latitude: rawHospitalLocation.coordinates[1], longitude: rawHospitalLocation.coordinates[0] }
      : undefined;
  const tripStage = accepted ? item.tripStage ?? "accepted" : null;
  const target = tripStage === "patient_on_board" || tripStage === "en_route_hospital" || tripStage === "arrived_hospital" ? hospitalLocation ?? item.location : item.location;
  const etaDistance = driverLocation && target ? distanceKm(driverLocation, target) : null;
  const etaMinutes = etaDistance === null ? null : Math.max(1, Math.ceil(etaDistance * 2.5)) + (item.issue?.etaDelayMinutes ?? 0);
  const destination = hospitalRequest
    ? { name: hospitalRequest.hospitalName, status: hospitalRequest.status, bedCategory: hospitalRequest.bedCategory, location: hospitalLocation }
    : destinationRequest ? { name: destinationRequest.name ?? "Destination", status: "pending", location: validCoordinates(destinationRequest) ? destinationRequest : undefined } : null;
  return Response.json({ request: {
    id: item._id,
    type: item.type ?? (item.requestType === "routine" ? "normal" : "sos"),
    status: item.status,
    incidentType: item.incidentType,
    location: item.location,
    destination,
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
