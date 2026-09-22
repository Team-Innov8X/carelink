import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import clientPromise from "./mongodb";

export type UserRole = "patient" | "hospital_staff" | "ambulance_driver" | "pharmacy";

let adapter;
try {
  const client = await clientPromise;
  adapter = mongodbAdapter(client.db(), { client });
} catch {
  // Safe fallback during build evaluation if MONGODB_URI is not set
  adapter = undefined as any;
}

export const auth = betterAuth({
  database: adapter,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "patient",
        required: false,
        input: true, // Allow passing role during sign up
      },
    },
  },
});
