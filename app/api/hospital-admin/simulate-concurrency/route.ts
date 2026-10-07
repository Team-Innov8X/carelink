import { randomUUID } from 'node:crypto';
import { requireRole } from '@/lib/auth-utils';
import connectMongo from '@/lib/mongodb';

export const runtime = 'nodejs';

/** Safe demo of the same compare-and-decrement reservation primitive, isolated from real beds. */
export async function POST() {
  const auth = await requireRole(['hospital_staff', 'hospital']);
  if (!auth.authorized || !auth.user) return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  const hospitalName = (auth.user as typeof auth.user & { hospitalName?: string }).hospitalName;
  if (!hospitalName) return Response.json({ error: 'Your account is not linked to a hospital.' }, { status: 403 });
  const key = `race-demo-${randomUUID()}`;
  const client = await connectMongo();
  const inventory = client.db().collection<{ _id: string; available: number }>('hospitalReservationSimulations');
  await inventory.insertOne({ _id: key, available: 1 });
  try {
    const attempt = () => inventory.updateOne({ _id: key, available: { $gt: 0 } }, { $inc: { available: -1 } });
    const outcomes = await Promise.all([attempt(), attempt()]);
    const succeeded = outcomes.filter((result) => result.modifiedCount === 1).length;
    return Response.json({ success: true, succeeded, returned: outcomes.length - succeeded, message: `${succeeded} request reserved the final test bed; ${outcomes.length - succeeded} request was returned. Real inventory was not changed.` });
  } finally {
    await inventory.deleteOne({ _id: key });
  }
}
