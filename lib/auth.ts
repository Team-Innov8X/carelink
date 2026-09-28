import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { username } from "better-auth/plugins";
import { client } from "./mongodb";
import { isSelfServiceRole } from "./roles";

export type { UserRole } from "./roles";

function createAuth(mongoClient: typeof client) {
  return betterAuth({
  database: mongodbAdapter(mongoClient.db(), { client: mongoClient }),
  secret: process.env.BETTER_AUTH_SECRET || "carelink_default_secret_key_change_in_production",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  },
  plugins: [username()],
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "patient",
        required: false,
        input: true,
      },
      phone: {
        type: "string",
        required: false,
        input: true,
      },
      hospitalName: {
        type: "string",
        required: false,
        input: true,
      },
      hospitalAddress: { type: "string", required: false, input: true },
      hospitalRegistrationNumber: { type: "string", required: false, input: true },
      hospitalSpecialties: { type: "string", required: false, input: true },
      pharmacyName: { type: "string", required: false, input: true },
      pharmacyAddress: { type: "string", required: false, input: true },
      pharmacyLicenseNumber: { type: "string", required: false, input: true },
      pharmacyType: { type: "string", required: false, input: true },
      licenseNumber: { type: "string", required: false, input: true },
      vehicleNumber: { type: "string", required: false, input: true },
      driverQualification: { type: "string", required: false, input: true },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const requestedRole = (user as typeof user & { role?: unknown }).role ?? "patient";
          if (!isSelfServiceRole(requestedRole)) return false;
          return { data: { ...user, role: requestedRole } };
        },
      },
      update: {
        before: async (user, context) => {
          if (!("role" in user)) return;
          const editorRole = (context as unknown as { context?: { session?: { user?: { role?: string } } } } | undefined)?.context?.session?.user?.role;
          if (editorRole !== "admin") return false;
        },
      },
    },
  },
  });
}

let boundMongoClient = client;
export let auth = createAuth(boundMongoClient);

/** Rebuild Better Auth if MongoDB replaced a client after a failed handshake. */
export function getAuth() {
  if (boundMongoClient !== client) {
    boundMongoClient = client;
    auth = createAuth(boundMongoClient);
  }
  return auth;
}
