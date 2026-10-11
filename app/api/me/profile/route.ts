import { getServerSession } from '@/lib/auth-utils';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export const runtime = 'nodejs';

function accountFilter(id: string) {
  const ids: Record<string, unknown>[] = [{ _id: id }, { id }];
  if (ObjectId.isValid(id)) ids.unshift({ _id: new ObjectId(id) });
  return { $or: ids };
}

function profileFrom(account: Record<string, unknown>) {
  const pharmacyProfileComplete = typeof account.pharmacyName === 'string' && Boolean(account.pharmacyName.trim()) && typeof account.pharmacyAddress === 'string' && Boolean(account.pharmacyAddress.trim()) && typeof account.pharmacyLicenseNumber === 'string' && Boolean(account.pharmacyLicenseNumber.trim());
  return {
    name: typeof account.name === 'string' ? account.name : '',
    username: typeof account.username === 'string' ? account.username : '',
    email: typeof account.email === 'string' ? account.email : '',
    phone: typeof account.phone === 'string' ? account.phone : '',
    role: typeof account.role === 'string' ? account.role : 'patient',
    organizationName: typeof account.hospitalName === 'string' ? account.hospitalName : typeof account.pharmacyName === 'string' ? account.pharmacyName : '',
    organizationAddress: typeof account.hospitalAddress === 'string' ? account.hospitalAddress : typeof account.pharmacyAddress === 'string' ? account.pharmacyAddress : '',
    onboardingCompleted: account.onboardingCompleted === true,
    pharmacyProfileComplete,
  };
}

export async function GET() {
  const session = await getServerSession();
  if (!session?.user) return Response.json({ error: 'Unauthenticated' }, { status: 401 });
  const db = (await clientPromise).db();
  const account = await db.collection('user').findOne(accountFilter(session.user.id));
  if (!account) return Response.json({ error: 'Profile not found.' }, { status: 404 });
  return Response.json(profileFrom(account as unknown as Record<string, unknown>), { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  const session = await getServerSession();
  if (!session?.user) return Response.json({ error: 'Unauthenticated' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid profile data.' }, { status: 400 }); }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const organizationName = typeof body.organizationName === 'string' ? body.organizationName.trim() : '';
  const organizationAddress = typeof body.organizationAddress === 'string' ? body.organizationAddress.trim() : '';
  if (name.length < 2 || name.length > 120) return Response.json({ error: 'Name must be between 2 and 120 characters.' }, { status: 400 });
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) return Response.json({ error: 'Username must be 3–32 characters using letters, numbers, dots, underscores, or hyphens.' }, { status: 400 });
  if (phone.length < 7 || phone.length > 30) return Response.json({ error: 'Enter a valid phone number.' }, { status: 400 });

  const db = (await clientPromise).db();
  const users = db.collection('user');
  const account = await users.findOne(accountFilter(session.user.id));
  if (!account) return Response.json({ error: 'Profile not found.' }, { status: 404 });
  const existingUsername = await users.findOne({
    username,
    ...(account._id ? { _id: { $ne: account._id } } : { id: { $ne: session.user.id } }),
  }, { projection: { _id: 1 }, collation: { locale: 'en', strength: 2 } });
  if (existingUsername && String(existingUsername._id) !== String(account._id)) return Response.json({ error: 'That username is already in use.' }, { status: 409 });

  const role = String(account.role || 'patient');
  const updates: Record<string, unknown> = { name, username, phone, updatedAt: new Date() };
  const organizationField = role === 'pharmacy' ? 'pharmacy' : role === 'hospital' || role === 'hospital_staff' || role === 'hospital_admin' ? 'hospital' : null;
  if (organizationField) {
    if (organizationName.length < 2 || organizationName.length > 180) return Response.json({ error: 'Enter a valid organization name.' }, { status: 400 });
    if (organizationAddress.length < 8 || organizationAddress.length > 500) return Response.json({ error: 'Enter an organization address between 8 and 500 characters.' }, { status: 400 });
    updates[`${organizationField}Name`] = organizationName;
    updates[`${organizationField}Address`] = organizationAddress;
  }

  const filter = account._id ? { _id: account._id } : accountFilter(session.user.id);
  await users.updateOne(filter, { $set: updates });
  if (organizationField) {
    const organizations = db.collection(organizationField === 'pharmacy' ? 'pharmacies' : 'hospitals');
    const record = await organizations.findOne({ ownerUserId: session.user.id });
    if (record) {
      await organizations.updateOne({ _id: record._id }, { $set: {
        name: organizationName,
        'address.street': organizationAddress,
        'contact.phone': phone,
        updatedAt: new Date(),
      } });
    }
  }

  return Response.json({ profile: {
    name, username, email: account.email || '', phone, role,
    organizationName, organizationAddress,
  } });
}
