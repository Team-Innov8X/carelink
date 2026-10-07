import { requireRole } from '@/lib/auth-utils';
import { sosCollections } from '@/lib/sos';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireRole(['ambulance_driver', 'driver']);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  const { requests } = await sosCollections();
  const trips = await requests.find({ driverId: auth.user.id, status: 'completed' }).sort({ completedAt: -1 }).limit(50).toArray();
  return Response.json({ trips: trips.map((trip) => ({ id: trip._id, patientName: trip.patientName, incidentType: trip.incidentType, createdAt: trip.createdAt, acceptedAt: trip.acceptedAt, completedAt: trip.completedAt, handoverAt: trip.tripTimestamps?.handover_complete, tripStage: trip.tripStage })) });
}
