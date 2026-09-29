import 'server-only';
import { redirect } from 'next/navigation';
import { getServerSession } from './auth-utils';

/** Redirect workspace page requests unless Better Auth validates the session cookie. */
export async function requireAuthenticatedPage() {
  let session: Awaited<ReturnType<typeof getServerSession>> = null;
  try {
    session = await getServerSession();
  } catch {
    // A session that cannot be verified must not render a protected page.
    // Send the user to sign-in instead of allowing a database outage to 500 the dashboard.
  }
  if (!session?.user) redirect('/signin');
  return session;
}
