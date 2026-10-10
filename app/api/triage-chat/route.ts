import { requireRole } from '@/lib/auth-utils';

export async function POST() {
  const auth = await requireRole('patient');
  if (!auth.authorized) {
    return Response.json({ error: auth.reason }, { status: auth.reason === 'UNAUTHENTICATED' ? 401 : 403 });
  }

  return Response.json({
    error: 'Symptom guidance is not configured for this CareLink installation. This service cannot assess symptoms. For urgent or severe symptoms, contact local emergency services or a clinician.',
  }, { status: 503 });
}
