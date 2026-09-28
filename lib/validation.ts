import { z } from "zod";
import { ROLES, isValidRole } from "./roles";

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

const normalizedCoordinatesSchema = z.union([
  z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) }),
  z.object({ lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180) }).transform(({ lat, lng }) => ({ latitude: lat, longitude: lng })),
]);

export const rankRequestSchema = z.object({
  emergencyType: z.string().trim().min(1).max(100),
  ambulanceLocation: normalizedCoordinatesSchema,
  requiredResources: z.array(z.string().trim().min(1)).optional(),
});

export const createHoldSchema = z.object({
  hospitalId: z.string().min(1),
  resourceId: z.string().min(1).optional(),
  resourceType: z.enum(["bed", "equipment", "specialist"]).optional(),
  category: z.string().trim().min(1).optional(),
  ambulanceId: z.string().trim().max(120).optional(),
  patientDetails: z.object({
    name: z.string().optional(), age: z.number().int().nonnegative().optional(), gender: z.string().optional(),
    conditionSummary: z.string().optional(), priority: z.enum(["critical", "urgent", "standard"]).default("urgent"), etaMinutes: z.number().nonnegative().optional(),
  }).default({ priority: "urgent" }),
  quantity: z.number().int().positive().default(1),
  originLocation: coordinateSchema.optional(),
  holdTimeoutMinutes: z.number().int().positive().max(120).optional(),
  notes: z.string().max(2000).optional(),
}).refine((value) => Boolean(value.resourceId || (value.resourceType && value.category)), { message: "resourceId or both resourceType and category are required." });

export const roleUpdateSchema = z.object({ role: z.enum(ROLES) });

export const cancelHoldSchema = z.object({
  reason: z.enum(["cancelled", "expired"]).optional(),
  originLocation: coordinateSchema.optional(),
}).optional();

export { isValidRole };
