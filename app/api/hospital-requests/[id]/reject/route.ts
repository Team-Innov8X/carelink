import { requireRole } from '@/lib/auth-utils';
import { workflowCollections } from '@/lib/sos';
import { writeHospitalAudit } from '@/lib/hospital-audit';

export const runtime = 'nodejs';

export async function POST(httpRequest: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireRole(['hospital_staff', 'hospital']);
  if (!authorization.authorized || !authorization.user) {
    return Response.json({ error: authorization.reason }, { status: authorization.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  }

  const { id } = await params;
  let body: { reason?: unknown };
  try { body = await httpRequest.json(); } catch { return Response.json({ error: 'A rejection reason is required.' }, { status: 400 }); }
  const validReasons = ['no_icu_bed', 'specialist_unavailable', 'diverted', 'other'] as const;
  if (typeof body.reason !== 'string' || !validReasons.includes(body.reason as typeof validReasons[number])) return Response.json({ error: 'Choose a valid rejection reason.' }, { status: 400 });
  const profile = authorization.user as typeof authorization.user & { hospitalId?: string; hospitalName?: string };
  const { hospitalRequests, notifications } = await workflowCollections();
  const hospitalRequest = await hospitalRequests.findOne({ _id: id });
  if (!hospitalRequest) return Response.json({ error: 'Hospital request not found.' }, { status: 404 });
  const belongsToHospital = profile.hospitalId
    ? profile.hospitalId === hospitalRequest.hospitalId
    : profile.hospitalName?.trim().toLocaleLowerCase() === hospitalRequest.hospitalName.trim().toLocaleLowerCase();
  if (!belongsToHospital) return Response.json({ error: 'This request belongs to another hospital.' }, { status: 403 });

  const rejectedAt = new Date();
  const reason = body.reason as typeof validReasons[number];
  const result = await hospitalRequests.updateOne(
    { _id: id, status: 'pending' },
    { $set: { status: 'rejected', rejectionReason: reason, updatedAt: rejectedAt } },
  );
  if (!result.modifiedCount) return Response.json({ error: 'This request is already being handled or is no longer pending.' }, { status: 409 });
  await writeHospitalAudit({ hospitalId: hospitalRequest.hospitalId, hospitalName: hospitalRequest.hospitalName, actorId: authorization.user.id, actorName: authorization.user.name, action: 'Request rejected', entityType: 'request', entityId: id, details: { reason }, createdAt: rejectedAt });

  await notifications.updateOne(
    { _id: `hospital-rejected-${id}` },
    { $setOnInsert: {
      _id: `hospital-rejected-${id}`,
      recipientId: hospitalRequest.patientId,
      type: 'hospital_request_rejected',
      title: 'Hospital could not accept your request',
      message: `${hospitalRequest.hospitalName} could not accept this request (${reason.replaceAll('_', ' ')}). Please continue through the emergency support flow.`,
      relatedRequestId: hospitalRequest.sosRequestId,
      createdAt: rejectedAt,
    } },
    { upsert: true },
  );
  return Response.json({ success: true, request: { id, status: 'rejected', rejectedAt, rejectionReason: reason } });
}
