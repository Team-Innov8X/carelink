import { requireRole } from '@/lib/auth-utils';
import { distanceKm, expireAndReofferDriverOffers, sosCollections, validCoordinates, workflowCollections } from '@/lib/sos';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  const auth = await requireRole('dispatcher');
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  const url = new URL(request.url);
  const hasCoordinates = url.searchParams.has('latitude') && url.searchParams.has('longitude');
  const location = hasCoordinates ? { latitude: Number(url.searchParams.get('latitude')), longitude: Number(url.searchParams.get('longitude')) } : null;
  if (hasCoordinates && !validCoordinates(location)) return Response.json({ error: 'Provide valid pickup coordinates.' }, { status: 400 });
  const { drivers, requests } = await sosCollections();
  const now = new Date();
  await expireAndReofferDriverOffers();
  await drivers.updateMany({ pendingOfferExpiresAt: { $lte: now }, pendingOfferRequestId: { $exists: true } }, { $unset: { pendingOfferRequestId: '', pendingOfferExpiresAt: '' } });
  const [driverRows, openRequests] = await Promise.all([
    drivers.find({}).toArray(),
    requests.find({ status: 'searching' }).sort({ createdAt: -1 }).limit(50).toArray(),
  ]);
  const sorted = driverRows.map((driver) => {
    const heartbeatFresh = driver.lastSeenAt instanceof Date && now.getTime() - driver.lastSeenAt.getTime() <= 30_000;
    const isAvailable = Boolean(driver.available && heartbeatFresh && !driver.activeRequestId && !driver.pendingOfferRequestId);
    const distance = location && validCoordinates(driver.location) ? distanceKm(location, driver.location) : null;
    return { id: driver.userId, name: driver.name ?? 'Ambulance driver', ambulanceId: driver.ambulanceId ?? driver.vehicleNumber ?? 'Not set', ambulanceType: driver.ambulanceType ?? 'Basic life support', crew: driver.crew ?? 'Driver + paramedic', status: isAvailable ? 'Available' : driver.activeRequestId || driver.pendingOfferRequestId ? 'Busy' : 'Offline', distanceKm: distance === null ? null : Number(distance.toFixed(1)), estimatedEtaMinutes: distance === null ? null : Math.max(1, Math.ceil(distance * 2.5)) };
  }).sort((a, b) => (a.status === 'Available' ? 0 : 1) - (b.status === 'Available' ? 0 : 1) || (a.estimatedEtaMinutes ?? Infinity) - (b.estimatedEtaMinutes ?? Infinity));
  return Response.json({ drivers: sorted, requests: openRequests.map((item) => ({ id: item._id, patientName: item.patientName, patientPhone: item.patientPhone, incidentType: item.incidentType, requiredEquipment: item.requiredEquipment, location: item.location, createdAt: item.createdAt, assignedDriverId: item.assignedDriverId, assignmentExpiresAt: item.assignmentExpiresAt })), now });
}

export async function POST(request: Request) {
  const auth = await requireRole('dispatcher');
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  let body: { requestId?: string; driverId?: string };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request body.' }, { status: 400 }); }
  if (!body.requestId || !body.driverId) return Response.json({ error: 'Choose a request and driver.' }, { status: 400 });
  const { drivers, requests } = await sosCollections();
  const expires = new Date(Date.now() + 15_000);
  const reservedDriver = await drivers.updateOne({ userId: body.driverId, available: true, lastSeenAt: { $gt: new Date(Date.now() - 30_000) }, activeRequestId: { $exists: false }, $or: [{ pendingOfferRequestId: { $exists: false } }, { pendingOfferExpiresAt: { $lte: new Date() } }] }, { $set: { pendingOfferRequestId: body.requestId, pendingOfferExpiresAt: expires, updatedAt: new Date() } });
  if (reservedDriver.modifiedCount !== 1) return Response.json({ error: 'Driver is no longer available. Refresh the driver list.' }, { status: 409 });
  const claimed = await requests.updateOne({ _id: body.requestId, status: 'searching', assignedDriverId: { $exists: false } }, { $set: { assignedDriverId: body.driverId, assignmentExpiresAt: expires, assignmentOfferedAt: new Date() } });
  if (claimed.modifiedCount !== 1) {
    await drivers.updateOne({ userId: body.driverId, pendingOfferRequestId: body.requestId }, { $unset: { pendingOfferRequestId: '', pendingOfferExpiresAt: '' } });
    return Response.json({ error: 'This request has already been assigned or offered to another driver.' }, { status: 409 });
  }
  try {
    const { notifications } = await workflowCollections();
    const now = new Date();
    await notifications.updateOne(
      { _id: `driver-offer-${body.requestId}-${body.driverId}` },
      { $setOnInsert: {
        _id: `driver-offer-${body.requestId}-${body.driverId}`,
        recipientId: body.driverId,
        type: 'sos_driver_offer',
        title: 'A dispatcher sent you an SOS offer',
        message: 'Respond from your driver dashboard before the offer expires.',
        relatedRequestId: body.requestId,
        createdAt: now,
      } },
      { upsert: true },
    );
  } catch (error) {
    console.error('Could not create driver notification for SOS offer:', error);
  }
  return Response.json({ success: true, expiresAt: expires.toISOString(), message: 'Offer sent to driver. The offer expires in 15 seconds if they do not respond.' });
}
