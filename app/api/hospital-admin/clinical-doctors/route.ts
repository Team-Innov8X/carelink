import { requireRole } from '@/lib/auth-utils';
import { getDoctorsCollection, getHospitalsCollection } from '@/lib/models';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireRole(['hospital', 'hospital_staff']);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  const user = auth.user as typeof auth.user & { hospitalName?: string };
  const hospitals = await getHospitalsCollection();
  const hospital = await hospitals.findOne({ $or: [{ ownerUserId: user.id }, ...(user.hospitalName ? [{ name: user.hospitalName }] : [])] }, { projection: { name: 1 } });
  if (!hospital?._id) return Response.json({ error: 'Add your address so patients can find you.' }, { status: 404 });
  const id = hospital._id.toString();
  const doctors = await (await getDoctorsCollection()).find({ hospitalId: id }).project({ name: 1, qualification: 1, specialization: 1, availability: 1, phone: 1, experienceYears: 1 }).sort({ name: 1 }).toArray();
  return Response.json({ hospitalId: id, doctors: doctors.map((doc) => ({ ...doc, id: doc._id?.toString() })) });
}
