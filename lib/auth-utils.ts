import { headers } from "next/headers";
import { auth, UserRole } from "./auth";

/**
 * Retrieve current user & session on the server side.
 */
export async function getServerSession() {
  const reqHeaders = await headers();
  return await auth.api.getSession({
    headers: reqHeaders,
  });
}

/**
 * Ensure user is logged in and possesses one of the allowed roles.
 */
export async function requireRole(
  sessionOrRoles?: Awaited<ReturnType<typeof getServerSession>> | UserRole | UserRole[],
  explicitRoles?: UserRole | UserRole[],
): Promise<RoleAuthorization> {
  const hasSessionArgument = arguments.length > 1;
  const session = hasSessionArgument ? sessionOrRoles as Awaited<ReturnType<typeof getServerSession>> : await getServerSession();
  const allowedRoles = hasSessionArgument ? explicitRoles : sessionOrRoles as UserRole | UserRole[] | undefined;
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
