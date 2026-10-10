import { requireRole } from '@/lib/auth-utils';
import { sosCollections, workflowCollections } from '@/lib/sos';

export const runtime = 'nodejs';

const stages = ['accepted', 'arrived_patient', 'patient_on_board', 'en_route_hospital', 'arrived_hospital', 'handover_complete'] as const;
type TripStage = typeof stages[number];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['ambulance_driver', 'driver']);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  const { id } = await params;
  let body: { stage?: unknown; vitals?: unknown; issue?: unknown; etaDelayMinutes?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request.' }, { status: 400 }); }
  const { requests, drivers } = await sosCollections();
  const sos = await requests.findOne({ _id: id, driverId: auth.user.id, status: 'accepted' });
  if (!sos) return Response.json({ error: 'Active assignment not found.' }, { status: 404 });

  const current = (sos.tripStage ?? (sos.arrivedAt ? 'arrived_patient' : 'accepted')) as TripStage;
  if (body.stage !== undefined) {
    if (typeof body.stage !== 'string' || !stages.includes(body.stage as TripStage) || stages.indexOf(body.stage as TripStage) !== stages.indexOf(current) + 1) {
      return Response.json({ error: 'Trip steps must be completed in order.' }, { status: 409 });
    }
    const at = new Date();
    const stage = body.stage as TripStage;
    const tripTimestamps = { ...(sos.tripTimestamps ?? {}), [stage]: at };
    const patch: Record<string, unknown> = { tripStage: stage, tripTimestamps, updatedAt: at };
    if (stage === 'arrived_patient') patch.arrivedAt = at;
    if (stage === 'handover_complete') patch.completedAt = at;
    const dispatchProgress: Partial<Record<TripStage, string>> = {
      arrived_patient: 'arrived_at_patient',
      patient_on_board: 'picked_up',
      en_route_hospital: 'en_route_to_hospital',
      handover_complete: 'completed',
    };
    const dispatchTo = dispatchProgress[stage];
    const dispatchFrom = sos.dispatchStatus ?? (stage === 'arrived_patient' ? 'accepted' : undefined);
    if (dispatchTo) patch.dispatchStatus = dispatchTo;
    if (stage === 'handover_complete') patch.status = 'completed';
    const expectedStage = sos.tripStage ? { tripStage: current } : current === 'accepted' ? { tripStage: { $exists: false }, arrivedAt: { $exists: false } } : { tripStage: { $exists: false }, arrivedAt: { $exists: true } };
    const update: Record<string, unknown> = { $set: patch };
    if (dispatchTo && dispatchFrom) {
      const transitions = stage === 'arrived_patient' && dispatchFrom === 'accepted'
        ? [
            { from: 'accepted', to: 'en_route_to_patient', at, actor: { type: 'driver', id: auth.user.id }, reason: 'Driver en route to patient' },
            { from: 'en_route_to_patient', to: 'arrived_at_patient', at, actor: { type: 'driver', id: auth.user.id }, reason: 'Driver arrived at patient' },
          ]
        : [{ from: dispatchFrom, to: dispatchTo, at, actor: { type: 'driver', id: auth.user.id }, reason: `Trip advanced to ${stage}` }];
      update.$push = { transitionLog: { $each: transitions } };
    }
    if (stage === 'handover_complete') update.$unset = { activePatientId: '' };
    const changed = await requests.updateOne({ _id: id, driverId: auth.user.id, status: 'accepted', ...expectedStage }, update as never);
    if (!changed.modifiedCount) return Response.json({ error: 'Trip status changed. Refresh the assignment and continue from the next step.' }, { status: 409 });
    if (stage === 'handover_complete') {
      await drivers.updateOne({ userId: auth.user.id, activeRequestId: id }, { $set: { available: true, availableSince: at, updatedAt: at }, $unset: { activeRequestId: '' } });
    }
    const { hospitalRequests } = await workflowCollections();
    await hospitalRequests.updateOne({ sosRequestId: id }, { $set: { driverTripStage: stage, driverTripUpdatedAt: at } });
    return Response.json({ success: true, stage, updatedAt: at, available: stage === 'handover_complete' });
  }

  const { hospitalRequests } = await workflowCollections();
  const hospitalRequest = await hospitalRequests.findOne({ sosRequestId: id });
  const at = new Date();
  if (body.vitals !== undefined) {
    const vitals = body.vitals as Record<string, unknown> | null;
    const bp = typeof vitals?.bp === 'string' ? vitals.bp.trim().slice(0, 20) : '';
    const hr = Number(vitals?.heartRate);
    const spO2 = Number(vitals?.spO2);
    if (!bp || !Number.isFinite(hr) || hr < 1 || hr > 300 || !Number.isFinite(spO2) || spO2 < 1 || spO2 > 100) return Response.json({ error: 'Enter a valid blood pressure, heart rate, and SpO₂.' }, { status: 400 });
    await requests.updateOne({ _id: id, driverId: auth.user.id, status: 'accepted' }, { $set: { vitalsUpdate: { bp, heartRate: hr, spO2, updatedAt: at } } });
    if (hospitalRequest) await hospitalRequests.updateOne({ _id: hospitalRequest._id }, { $set: { driverVitalsUpdate: { bp, heartRate: hr, spO2, updatedAt: at } } });
    return Response.json({ success: true, message: 'Vitals sent to the hospital team.' });
  }
  if (body.issue !== undefined) {
    const issue = typeof body.issue === 'string' ? body.issue.trim().slice(0, 240) : '';
    if (issue.length < 3) return Response.json({ error: 'Describe the issue before sending it.' }, { status: 400 });
    const etaDelayMinutes = body.etaDelayMinutes === undefined ? 0 : Number(body.etaDelayMinutes);
    if (!Number.isInteger(etaDelayMinutes) || etaDelayMinutes < 0 || etaDelayMinutes > 240) return Response.json({ error: 'Delay must be between 0 and 240 minutes.' }, { status: 400 });
    await requests.updateOne({ _id: id, driverId: auth.user.id, status: 'accepted' }, { $set: { issue: { message: issue, updatedAt: at, etaDelayMinutes } } });
    if (hospitalRequest) await hospitalRequests.updateOne({ _id: hospitalRequest._id }, { $set: { driverIssue: { message: issue, updatedAt: at, etaDelayMinutes } } });
    return Response.json({ success: true, message: 'Issue sent to the hospital team.' });
  }
  return Response.json({ error: 'Provide a trip step, vitals update, or issue.' }, { status: 400 });
}
