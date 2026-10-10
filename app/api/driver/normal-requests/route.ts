import { requireRole } from '@/lib/auth-utils';
import { distanceKm, expireAndReofferDriverOffers, sosCollections, validCoordinates } from '@/lib/sos';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireRole(['ambulance_driver', 'driver']);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  await expireAndReofferDriverOffers();
  const { requests, drivers } = await sosCollections();
  const [driver, rows] = await Promise.all([
    drivers.findOne({ userId: auth.user.id }),
    requests.find({
      status: 'searching',
      rejectedDriverIds: { $ne: auth.user.id },
      $and: [
        { $or: [{ requestType: 'routine' }, { requestType: { $exists: false }, incidentType: /^Routine Transport:/i }] },
        { $or: [{ assignedDriverId: auth.user.id }, { assignedDriverId: { $exists: false } }] },
      ],
    }).sort({ createdAt: -1 }).limit(100).toArray(),
  ]);
  return Response.json({ requests: rows.map((item) => ({
    id: item._id,
    patientName: item.patientName,
    patientPhone: item.patientPhone,
    incidentType: item.incidentType,
    location: item.location,
    distanceKm: validCoordinates(driver?.location) ? Number(distanceKm(driver.location, item.location).toFixed(1)) : null,
    preferredTime: item.preferredTime,
    notes: item.notes,
    createdAt: item.createdAt,
    assignmentExpiresAt: item.assignmentExpiresAt,
  })) });
}
