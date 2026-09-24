import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { client } from "./mongodb";

export type UserRole =
  | "admin"
  | "hospital"
  | "patient"
  | "hospital_staff"
  | "ambulance_driver"
  | "driver"
  | "dispatcher"
  | "pharmacy";

export const auth = betterAuth({
  database: mongodbAdapter(client.db(), { client }),
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
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "patient",
        required: false,
        input: true,
      },
    },
  },
});
