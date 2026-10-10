import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-utils';
import { getUsersCollection } from '@/lib/models';
import { isSelfServiceRole } from '@/lib/roles';

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  let body: { role?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  if (!isSelfServiceRole(body.role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  const users = await getUsersCollection();
  const result = await users.updateOne(
    { _id: session.user.id as never, role: 'patient', onboardingComplete: { $ne: true } } as never,
    { $set: { role: body.role, updatedAt: new Date() } } as never,
  );
  if (!result.modifiedCount && (session.user as { role?: string }).role !== body.role) return NextResponse.json({ error: 'Role was already selected or could not be updated' }, { status: 409 });
  return NextResponse.json({ role: body.role });
}
