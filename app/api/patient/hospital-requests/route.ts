import { requireRole } from '@/lib/auth-utils';
import { expireHospitalReservations } from '@/lib/hospital-reservations';
import { workflowCollections } from '@/lib/sos';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireRole('patient');
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  const { hospitalRequests, hospitalAdmissions } = await workflowCollections();
  let requests = await hospitalRequests.find({ patientId: auth.user.id }).sort({ createdAt: -1 }).limit(50).toArray();
  await Promise.all([...new Set(requests.map((item) => item.hospitalName))].map((hospitalName) => expireHospitalReservations({ hospitalName })));
  requests = await hospitalRequests.find({ patientId: auth.user.id }).sort({ createdAt: -1 }).limit(50).toArray();
  const admissions = requests.length ? await hospitalAdmissions.find({ hospitalRequestId: { $in: requests.map((item) => item._id) } }).sort({ admittedAt: -1 }).toArray() : [];
  const admissionByRequest = new Map(admissions.map((item) => [item.hospitalRequestId, item]));
  return Response.json({ requests: requests.map((request) => ({ ...request, admission: admissionByRequest.get(request._id) ?? null })) });
}
