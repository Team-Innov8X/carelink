import { z } from "zod";

const coordinateSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);

export const hospitalCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  location: z.object({ type: z.literal("Point"), coordinates: coordinateSchema }),
  address: z.object({ street: z.string().trim().min(1), city: z.string().trim().min(1), state: z.string().trim().min(1), zipCode: z.string().trim().min(1), country: z.string().trim().min(1) }),
  contact: z.object({ phone: z.string().trim().min(1), email: z.string().email(), emergencyHotline: z.string().trim().min(1) }),
});

export const resourceUpdateSchema = z.object({
  resourceId: z.string().min(1),
  status: z.enum(["available", "limited", "unavailable"]),
  count: z.number().int().nonnegative(),
});

export const rankRequestSchema = z.object({
  emergencyType: z.string().trim().min(1).max(100),
  ambulanceLocation: z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) }),
  requiredResources: z.array(z.string().trim().min(1)).optional(),
});

export const createHoldSchema = z.object({
  hospitalId: z.string().min(1),
  resourceType: z.enum(["bed", "equipment", "specialist"]),
  category: z.string().trim().min(1),
  requestedByUserId: z.string().min(1),
  patientDetails: z.object({
    name: z.string().optional(), age: z.number().int().nonnegative().optional(), gender: z.string().optional(),
    conditionSummary: z.string().optional(), priority: z.enum(["critical", "urgent", "standard"]), etaMinutes: z.number().nonnegative().optional(),
  }),
  quantity: z.number().int().positive().default(1),
  originLocation: coordinateSchema.optional(),
  holdTimeoutMinutes: z.number().int().positive().max(120).optional(),
  notes: z.string().max(2000).optional(),
});

export const roleUpdateSchema = z.object({ role: z.enum(["admin", "hospital", "patient", "hospital_staff", "ambulance_driver", "driver", "dispatcher", "pharmacy"]) });

export const cancelHoldSchema = z.object({
  reason: z.enum(["cancelled", "expired"]).optional(),
  originLocation: coordinateSchema.optional(),
}).optional();

export function isValidRole(value: unknown): value is import("./auth").UserRole {
  return roleUpdateSchema.shape.role.safeParse(value).success;
}
