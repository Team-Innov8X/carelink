import { requireRole } from '@/lib/auth-utils';
import connectMongo from '@/lib/mongodb';
import { distanceKm, sosCollections, workflowCollections } from '@/lib/sos';
import { getResourcesCollection } from '@/lib/models';

export const runtime = 'nodejs';

export async function POST(_request: Request, context: RouteContext<'/api/sos/[id]/reroute'>) {
  const auth = await requireRole(['ambulance_driver', 'driver']);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  const { id } = await context.params;
  const { requests } = await sosCollections();
  const sos = await requests.findOne({ _id: id, driverId: auth.user.id, status: 'accepted' });
  if (!sos) return Response.json({ error: 'Active assignment not found.' }, { status: 404 });
  const { hospitalRequests, notifications } = await workflowCollections();
  const current = await hospitalRequests.findOne({ sosRequestId: id });
  if (!current || !['rejected', 'pending'].includes(current.status) || (current.status === 'pending' && Date.now() - current.createdAt.getTime() < 15 * 60_000)) return Response.json({ error: 'This hospital has not rejected or timed out the request.' }, { status: 409 });
  const excluded = new Set([current.hospitalId, ...(current.reroutedHospitalIds ?? [])]);
  const db = (await connectMongo()).db();
  let next: { id: string; name: string; location: { lat: number; lng: number; address: string } } | undefined;
  if (process.env.NODE_ENV === 'development') {
    const appState = await db.collection<{ _id: string; state?: { hospitals?: Array<{ id: string; name: string; location: { lat: number; lng: number; address: string }; beds?: Record<string, { available: number }> }> } }>('appState').findOne({ _id: 'carelink' });
    const candidates = (appState?.state?.hospitals ?? []).filter((hospital: { id: string; name: string; location: { lat: number; lng: number; address: string }; beds?: Record<string, { available: number }> }) => !excluded.has(hospital.id) && (!current.bedCategory || (hospital.beds?.[current.bedCategory]?.available ?? 0) > 0));
    candidates.sort((a: { id: string; name: string; location: { lat: number; lng: number; address: string } }, b: { id: string; name: string; location: { lat: number; lng: number; address: string } }) => distanceKm(sos.location, { latitude: a.location.lat, longitude: a.location.lng }) - distanceKm(sos.location, { latitude: b.location.lat, longitude: b.location.lng }));
    next = candidates[0];
  } else {
    const { hospitals } = await sosCollections();
    const [registered, resources] = await Promise.all([hospitals.find({ status: { $ne: 'inactive' } }).toArray(), (await getResourcesCollection()).find({ status: { $ne: 'unavailable' } }).toArray()]);
    const equipmentByHospital = new Map<string, Set<string>>();
    for (const resource of resources) {
      if (resource.availableQuantity - resource.heldQuantity <= 0) continue;
      const key = equipmentByHospital.get(resource.hospitalId) ?? new Set<string>(); key.add(resource.category.toLowerCase()); equipmentByHospital.set(resource.hospitalId, key);
    }
    const candidates = registered.flatMap((hospital) => {
      const id = String(hospital._id); if (excluded.has(id)) return [];
      const raw = hospital.location as unknown as { latitude?: unknown; longitude?: unknown; coordinates?: unknown };
      const point = typeof raw?.latitude === 'number' && typeof raw.longitude === 'number' ? { latitude: raw.latitude, longitude: raw.longitude } : Array.isArray(raw?.coordinates) && typeof raw.coordinates[0] === 'number' && typeof raw.coordinates[1] === 'number' ? { latitude: raw.coordinates[1], longitude: raw.coordinates[0] } : null;
      if (!point) return [];
      const available = new Set([...(hospital.equipment ?? []).map((item) => item.toLowerCase()), ...(equipmentByHospital.get(id) ?? [])]);
      if (!sos.requiredEquipment.every((item) => available.has(item.toLowerCase()))) return [];
      return [{ id, name: hospital.name, location: { lat: point.latitude, lng: point.longitude, address: hospital.address ?? '' }, distance: distanceKm(sos.location, point) }];
    }).sort((a, b) => a.distance - b.distance);
    const candidate = candidates[0]; if (candidate) next = { id: candidate.id, name: candidate.name, location: candidate.location };
  }
  if (!next) return Response.json({ error: 'No other hospital has a matching available resource right now.' }, { status: 404 });
  const now = new Date();
  const updated = await hospitalRequests.updateOne({ _id: current._id, status: current.status, updatedAt: current.updatedAt }, { $set: { hospitalId: next.id, hospitalName: next.name, status: 'pending', createdAt: now, updatedAt: now, reroutedHospitalIds: [...(current.reroutedHospitalIds ?? []), current.hospitalId], reroutedHospitalName: next.name, driverTripStage: sos.tripStage ?? 'accepted' }, $unset: { rejectionReason: '', acceptedAt: '', reservationExpiresAt: '' } });
  if (!updated.modifiedCount) return Response.json({ error: 'Hospital status changed while rerouting. Refresh and try again.' }, { status: 409 });
  await notifications.updateOne({ _id: `hospital-rerouted-${current._id}-${now.getTime()}` }, { $setOnInsert: { _id: `hospital-rerouted-${current._id}-${now.getTime()}`, recipientId: sos.patientId, type: 'hospital_request_rerouted', title: 'Emergency sent to another hospital', message: `${current.hospitalName} could not confirm the request. It was rerouted to ${next.name}.`, relatedRequestId: id, createdAt: now } }, { upsert: true });
  return Response.json({ success: true, destination: { id: next.id, name: next.name, location: next.location }, message: `Rerouted to ${next.name}.` });
}
