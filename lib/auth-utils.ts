import { headers } from "next/headers";
import { getAuth } from "./auth";
import connectMongo from "./mongodb";
import type { UserRole } from "./roles";
import { getHospitalsCollection } from "./models";

/**
 * Retrieve current user & session on the server side.
 */
export async function getServerSession() {
  const reqHeaders = await headers();
  await connectMongo();
  return await getAuth().api.getSession({
    headers: reqHeaders,
  });
}

/** Resolve a hospital staff account to its linked hospital, supporting legacy signups that stored only the name. */
export async function resolveHospitalId(user: { hospitalId?: string; hospitalName?: string }) {
  if (user.hospitalId) return user.hospitalId;
  if (!user.hospitalName?.trim()) return null;
  const hospital = await (await getHospitalsCollection()).findOne(
    { name: user.hospitalName.trim() },
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
