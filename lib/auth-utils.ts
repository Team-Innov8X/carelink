import { headers } from "next/headers";
import { auth, UserRole } from "./auth";
import { getHospitalsCollection } from "./models";
import { connectMongoClient } from "./mongodb";

/**
 * Retrieve current user & session on the server side.
 */
export async function getServerSession() {
  const startedAt = performance.now();
  await connectMongoClient();
  const reqHeaders = await headers();
  const session = await auth.api.getSession({
    headers: reqHeaders,
  });
  if (process.env.CARELINK_PERF_LOGS === "1") {
    console.info(JSON.stringify({ event: "carelink.perf", name: "session_lookup", durationMs: Math.round((performance.now() - startedAt) * 100) / 100, authenticated: Boolean(session?.user) }));
  }
  return session;
}

/** Resolve legacy hospital staff profiles that stored only the facility name. */
export async function resolveHospitalId(user: { hospitalId?: string; hospitalName?: string }) {
  if (user.hospitalId) return user.hospitalId;
  const hospitalName = user.hospitalName?.trim();
  if (!hospitalName) return null;
  const hospital = await (await getHospitalsCollection()).findOne(
    { name: hospitalName },
    { projection: { _id: 1 } },
  );
  return hospital?._id?.toString() ?? null;
}

/**
 * Ensure user is logged in and possesses one of the allowed roles.
 */
export async function requireRole(
  sessionOrRoles?: Awaited<ReturnType<typeof getServerSession>> | UserRole | UserRole[],
  explicitRoles?: UserRole | UserRole[],
): Promise<RoleAuthorization> {
  const isSession = Boolean(sessionOrRoles && typeof sessionOrRoles === "object" && !Array.isArray(sessionOrRoles) && ("user" in sessionOrRoles || "session" in sessionOrRoles));
  const session = isSession ? (sessionOrRoles as Awaited<ReturnType<typeof getServerSession>>) : await getServerSession();
  const allowedRoles = isSession ? explicitRoles : (sessionOrRoles as UserRole | UserRole[] | undefined);
  if (!session || !session.user) {
    return { authorized: false, reason: "UNAUTHENTICATED" as const, user: null };
  }

  if (allowedRoles) {
    const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    const userRole = (session.user as { role?: UserRole }).role || "patient";

    if (!rolesArray.includes(userRole as UserRole)) {
      return {
        authorized: false,
        reason: "FORBIDDEN" as const,
        user: session.user,
        role: userRole,
      };
    }
  }

  return { authorized: true, reason: null, user: session.user };
}

export type RoleAuthorization =
  | { authorized: true; reason: null; user: NonNullable<Awaited<ReturnType<typeof getServerSession>>>["user"] }
  | { authorized: false; reason: "UNAUTHENTICATED"; user: null }
  | { authorized: false; reason: "FORBIDDEN"; user: NonNullable<Awaited<ReturnType<typeof getServerSession>>>["user"]; role: string };
