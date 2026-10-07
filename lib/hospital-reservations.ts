import connectMongo from '@/lib/mongodb';
import { workflowCollections } from '@/lib/sos';
import { ObjectId } from 'mongodb';
import { getHoldsCollection, getResourcesCollection } from '@/lib/models';

/** Releases accepted reservations that were never converted into admissions. */
export async function expireHospitalReservations(scope: { hospitalId?: string; hospitalName?: string }) {
  const { hospitalRequests, hospitalAdmissions, notifications } = await workflowCollections();
  const now = new Date();
  const hospitalScope = scope.hospitalId ? { hospitalId: scope.hospitalId } : scope.hospitalName ? { hospitalName: scope.hospitalName } : null;
  if (!hospitalScope) return;
  const timedOutRequests = await hospitalRequests.find({ status: 'pending', createdAt: { $lte: new Date(now.getTime() - 15 * 60_000) }, ...hospitalScope }).limit(100).toArray();
  for (const request of timedOutRequests) {
    const timedOut = await hospitalRequests.updateOne({ _id: request._id, status: 'pending', createdAt: { $lte: new Date(now.getTime() - 15 * 60_000) } }, { $set: { status: 'rejected', rejectionReason: 'reservation_timeout', updatedAt: now } });
    if (!timedOut.modifiedCount) continue;
    await notifications.updateOne({ _id: `hospital-response-timeout-${request._id}` }, { $setOnInsert: { _id: `hospital-response-timeout-${request._id}`, recipientId: request.patientId, type: 'hospital_request_rejected', title: 'Hospital response window expired', message: `${request.hospitalName} did not respond within 15 minutes. Your request has been returned to emergency dispatch.`, relatedRequestId: request.sosRequestId, createdAt: now } }, { upsert: true });
  }
  const expired = await hospitalRequests.find({ status: 'accepted', reservationExpiresAt: { $lte: now }, ...hospitalScope }).limit(100).toArray();
  const database = (await connectMongo()).db();
  const appState = database.collection<{ _id: string }>('appState');
  for (const request of expired) {
    const lock = await hospitalRequests.updateOne({ _id: request._id, status: 'accepted', reservationExpiresAt: { $lte: now } }, { $set: { status: 'expiring', updatedAt: now } });
    if (!lock.modifiedCount) continue;
    const admission = await hospitalAdmissions.findOne({ hospitalRequestId: request._id, dischargedAt: { $exists: false } });
    if (admission) {
      await hospitalRequests.updateOne({ _id: request._id, status: 'expiring' }, { $set: { status: 'accepted' } });
      continue;
    }
    if (request.inventorySource === 'app-state' && request.bedCategory) {
      const state = await database.collection<{ _id: string; state?: { hospitals?: Array<{ id: string; beds?: Record<string, { total: number; available: number }> }> } }>('appState').findOne({ _id: 'carelink' });
      const bed = state?.state?.hospitals?.find((item) => item.id === request.hospitalId)?.beds?.[request.bedCategory];
      if (!bed) { await hospitalRequests.updateOne({ _id: request._id, status: 'expiring' }, { $set: { status: 'accepted' } }); continue; }
      const result = await appState.updateOne({ _id: 'carelink', state: { $exists: true }, 'state.hospitals': { $elemMatch: { id: request.hospitalId, [`beds.${request.bedCategory}.total`]: bed.total, [`beds.${request.bedCategory}.available`]: bed.available } } }, { $inc: { [`state.hospitals.$[hospital].beds.${request.bedCategory}.available`]: 1 }, $set: { updatedAt: now } }, { arrayFilters: [{ 'hospital.id': request.hospitalId }] });
      if (!result.modifiedCount) { await hospitalRequests.updateOne({ _id: request._id, status: 'expiring' }, { $set: { status: 'accepted' } }); continue; }
    } else if (request.holdId) {
      const holds = await getHoldsCollection();
      const holdKey = ObjectId.isValid(request.holdId) ? new ObjectId(request.holdId) : request.holdId;
      const hold = await holds.findOne({ _id: holdKey as never, status: 'confirmed' });
      const resourceKey = hold && (ObjectId.isValid(hold.resourceId) ? new ObjectId(hold.resourceId) : hold.resourceId);
      const resources = await getResourcesCollection();
      const resource = resourceKey ? await resources.findOne({ _id: resourceKey as never }) : null;
      if (!hold || !resource || resource.availableQuantity + hold.quantity > resource.totalQuantity) { await hospitalRequests.updateOne({ _id: request._id, status: 'expiring' }, { $set: { status: 'accepted' } }); continue; }
      const restored = await resources.updateOne({ _id: resourceKey as never, availableQuantity: resource.availableQuantity, totalQuantity: resource.totalQuantity }, { $inc: { availableQuantity: hold.quantity }, $set: { status: 'available', updatedAt: now } });
      if (!restored.modifiedCount) { await hospitalRequests.updateOne({ _id: request._id, status: 'expiring' }, { $set: { status: 'accepted' } }); continue; }
      await holds.updateOne({ _id: hold._id, status: 'confirmed' }, { $set: { status: 'expired', updatedAt: now } });
    }
    await hospitalRequests.updateOne({ _id: request._id, status: 'expiring' }, { $set: { status: 'rejected', rejectionReason: 'reservation_timeout', updatedAt: now }, $unset: { reservationExpiresAt: '' } });
    await notifications.updateOne({ _id: `hospital-timeout-${request._id}` }, { $setOnInsert: { _id: `hospital-timeout-${request._id}`, recipientId: request.patientId, type: 'hospital_request_rejected', title: 'Hospital reservation expired', message: `${request.hospitalName} released the bed reservation because arrival was not recorded within 30 minutes.`, relatedRequestId: request.sosRequestId, createdAt: now } }, { upsert: true });
  }
}
