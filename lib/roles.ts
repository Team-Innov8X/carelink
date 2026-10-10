export const ROLES = ["admin", "hospital", "hospital_staff", "patient", "pharmacy", "ambulance_driver", "driver", "dispatcher"] as const;
export type UserRole = (typeof ROLES)[number];
export const SELF_SERVICE_ROLES = ["patient", "hospital_staff", "driver", "pharmacy"] as const satisfies readonly UserRole[];
export function isValidRole(value: unknown): value is UserRole {
  return typeof value === "string" && ROLES.includes(value as UserRole);
}
export function isSelfServiceRole(value: unknown): value is (typeof SELF_SERVICE_ROLES)[number] {
  return typeof value === "string" && SELF_SERVICE_ROLES.includes(value as (typeof SELF_SERVICE_ROLES)[number]);
}
