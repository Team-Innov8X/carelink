import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { username } from "better-auth/plugins";
import { client } from "./mongodb";
import { isSelfServiceRole } from "./roles";

export type { UserRole } from "./roles";

function createAuth(mongoClient: typeof client) {
  const resolvedBaseUrl = (
    process.env.BETTER_AUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  ).replace(/\/+$/, "");

  return betterAuth({
  database: mongodbAdapter(mongoClient.db(), { client: mongoClient }),
  secret: process.env.BETTER_AUTH_SECRET || "carelink_default_secret_key_change_in_production",
  baseURL: resolvedBaseUrl,
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

          // Auto-generate username from email or name if absent (e.g. Google OAuth sign-in)
          const existingUsername = (user as { username?: string }).username;
          let generatedUsername = existingUsername;
          if (!generatedUsername || !generatedUsername.trim()) {
            const rawBase = (user.email ? user.email.split("@")[0] : user.name || "user")
              .toLowerCase()
              .replace(/[^a-z0-9_.]/g, "_")
              .slice(0, 18);
            const randomSuffix = Math.floor(1000 + Math.random() * 9000);
            generatedUsername = `${rawBase || "user"}_${randomSuffix}`;
          }

          return { data: { ...user, role: requestedRole, username: generatedUsername } };
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
