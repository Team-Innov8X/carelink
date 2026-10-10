import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
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
    sendResetPassword: async ({ user, url }) => {
      if (process.env.RESEND_API_KEY && process.env.RESEND_FROM) {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: process.env.RESEND_FROM, to: [user.email], subject: "Reset your CareLink password", text: `Use this link to reset your CareLink password (valid for one hour): ${url}` }),
        });
        if (!response.ok) throw new Error("Password reset email could not be sent.");
        return;
      }
      if (process.env.NODE_ENV !== "production") console.info(`[password-reset] ${user.email}: ${url}`);
      else throw new Error("Password reset email is not configured.");
    },
  },
  session: { cookieCache: { enabled: true, maxAge: 300 } },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "patient",
        required: false,
        input: false,
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
      onboardingCompleted: { type: "boolean", required: false, defaultValue: false, input: false },
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
