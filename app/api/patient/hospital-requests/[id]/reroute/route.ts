import { requireRole } from '@/lib/auth-utils';
import { createRequestId, distanceKm, workflowCollections } from '@/lib/sos';
import connectMongo from '@/lib/mongodb';

export const runtime = 'nodejs';

export async function POST(_request: Request, context: RouteContext<'/api/patient/hospital-requests/[id]/reroute'>) {
  const auth = await requireRole('patient');
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  const { id } = await context.params;
  const { hospitalRequests, notifications } = await workflowCollections();
  const oldRequest = await hospitalRequests.findOne({ _id: id, patientId: auth.user.id, status: 'rejected' });
  if (!oldRequest) return Response.json({ error: 'A rejected request for your account was not found.' }, { status: 404 });
  if (oldRequest.reroutedToRequestId) return Response.json({ error: `This request was already rerouted to ${oldRequest.reroutedHospitalName || 'another hospital'}.` }, { status: 409 });
  const client = await connectMongo();
  const appState = await client.db().collection<{ _id: string; state?: { hospitals?: Array<{ id: string; name: string; location?: { lat?: number; lng?: number }; beds?: Record<string, { available?: number }>; specialties?: string[]; lastUpdatedMinutesAgo?: number }> } }>('appState').findOne({ _id: 'carelink' });
  const visited = new Set([oldRequest.hospitalId, ...(oldRequest.reroutedHospitalIds ?? [])]);
  const next = (appState?.state?.hospitals ?? []).flatMap((hospital: { id: string; name: string; location?: { lat?: number; lng?: number }; beds?: Record<string, { available?: number }>; specialties?: string[]; lastUpdatedMinutesAgo?: number }) => {
    const point = hospital.location;
    if (visited.has(hospital.id) || typeof point?.lat !== 'number' || typeof point.lng !== 'number') return [];
    if (hospital.beds?.[oldRequest.bedCategory || 'general']?.available !== undefined && hospital.beds[oldRequest.bedCategory || 'general'].available! <= 0) return [];
    const distance = distanceKm(oldRequest.location, { latitude: point.lat, longitude: point.lng });
    return [{ hospital, distance }];
  }).sort((a: { hospital: { lastUpdatedMinutesAgo?: number }; distance: number }, b: { hospital: { lastUpdatedMinutesAgo?: number }; distance: number }) => a.distance - b.distance || (a.hospital.lastUpdatedMinutesAgo ?? 0) - (b.hospital.lastUpdatedMinutesAgo ?? 0))[0];
  if (!next) return Response.json({ error: 'No other hospital currently has the requested bed available.' }, { status: 409 });
  const now = new Date();
  const nextRequest = { ...oldRequest, _id: createRequestId(), sosRequestId: `${oldRequest.sosRequestId}-R${(oldRequest.reroutedHospitalIds?.length ?? 0) + 1}`, hospitalId: next.hospital.id, hospitalName: next.hospital.name, status: 'pending' as const, createdAt: now, updatedAt: now, reroutedHospitalIds: [...(oldRequest.reroutedHospitalIds ?? []), oldRequest.hospitalId], reroutedToRequestId: undefined, reroutedHospitalName: undefined, acceptedAt: undefined, reservationExpiresAt: undefined, rejectionReason: undefined, holdId: undefined };
  const claim = await hospitalRequests.updateOne({ _id: id, patientId: auth.user.id, status: 'rejected', reroutedToRequestId: { $exists: false } }, { $set: { status: 'rerouting', updatedAt: now } });
  if (!claim.modifiedCount) return Response.json({ error: 'This request was already rerouted or has changed.' }, { status: 409 });
  try {
    await hospitalRequests.insertOne(nextRequest);
    await hospitalRequests.updateOne({ _id: id, patientId: auth.user.id, status: 'rerouting' }, { $set: { status: 'rejected', reroutedToRequestId: nextRequest._id, reroutedHospitalName: next.hospital.name, updatedAt: now } });
    await notifications.updateOne({ _id: `hospital-rerouted-${nextRequest._id}` }, { $setOnInsert: { _id: `hospital-rerouted-${nextRequest._id}`, recipientId: auth.user.id, type: 'hospital_request_rerouted', title: 'Request sent to next-ranked hospital', message: `Your request was sent to ${next.hospital.name} and is waiting for confirmation.`, relatedRequestId: nextRequest.sosRequestId, createdAt: now } }, { upsert: true });
  } catch (error) {
    await hospitalRequests.updateOne({ _id: id, patientId: auth.user.id, status: 'rerouting' }, { $set: { status: 'rejected', updatedAt: new Date() } });
    throw error;
  }
  return Response.json({ success: true, request: nextRequest, message: `Rerouted to ${next.hospital.name}.` }, { status: 201 });
}
