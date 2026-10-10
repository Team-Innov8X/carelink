import { requireRole } from '@/lib/auth-utils';
import { sosCollections } from '@/lib/sos';

export const runtime = 'nodejs';

type HistoryEntry = { id: string; patientName: string; incidentType: string; createdAt: Date; acceptedAt?: Date; completedAt?: Date; cancelledAt?: Date; handoverAt?: Date; missedAt?: Date; tripStage?: string; status: string; sortAt: Date };

export async function GET() {
  const auth = await requireRole(['ambulance_driver', 'driver']);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  const { requests, offers } = await sosCollections();
  const [trips, expiredOffers] = await Promise.all([
    requests.find({ driverId: auth.user.id, status: { $in: ['completed', 'cancelled'] } }).sort({ updatedAt: -1 }).limit(50).toArray(),
    offers.find({ driverId: auth.user.id, status: 'expired' }).sort({ respondedAt: -1 }).limit(50).toArray(),
  ]);
  const expiredRequestIds = [...new Set(expiredOffers.map((offer) => offer.requestId))];
  const missedRequests = expiredRequestIds.length
    ? await requests.find({ _id: { $in: expiredRequestIds }, type: { $ne: 'normal' } }).project({ _id: 1, incidentType: 1, createdAt: 1 }).toArray()
    : [];
  const missedById = new Map(missedRequests.map((request) => [request._id, request]));
  const history: HistoryEntry[] = [
    ...trips.map((trip): HistoryEntry => {
      const cancelledAt = (trip as typeof trip & { cancelledAt?: Date }).cancelledAt;
      return { id: trip._id, patientName: trip.patientName, incidentType: trip.incidentType, createdAt: trip.createdAt, acceptedAt: trip.acceptedAt, completedAt: trip.completedAt, cancelledAt, handoverAt: trip.tripTimestamps?.handover_complete, tripStage: trip.tripStage, status: trip.status, sortAt: trip.completedAt ?? cancelledAt ?? trip.acceptedAt ?? trip.createdAt };
    }),
    ...expiredOffers.flatMap((offer): HistoryEntry[] => {
      const request = missedById.get(offer.requestId);
      return request ? [{ id: offer._id, patientName: 'SOS offer', incidentType: request.incidentType ?? 'Emergency request', createdAt: request.createdAt, missedAt: offer.respondedAt ?? offer.expiresAt, status: 'missed', sortAt: offer.respondedAt ?? offer.expiresAt }] : [];
    }),
  ].sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime()).slice(0, 100);
  return Response.json({ trips: history.map((entry) => { const publicEntry = { ...entry }; Reflect.deleteProperty(publicEntry, 'sortAt'); return publicEntry; }) });
}
