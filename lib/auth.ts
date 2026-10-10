import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { username } from "better-auth/plugins";
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
    sendResetPassword: async ({ user, url }) => {
      const host = process.env.SMTP_HOST;
      if (!host) {
        if (process.env.NODE_ENV === 'production') throw new Error('Password reset email is not configured.');
        console.info(`[dev password reset] ${user.email}: ${url}`);
        return;
      }
      const nodemailer = await import('nodemailer');
      const transport = nodemailer.createTransport({ host, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT) === 465, auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined });
      await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: user.email, subject: 'Reset your CareLink password', text: `Reset your password: ${url}` });
    },
  },
  session: { cookieCache: { enabled: true, maxAge: 300 } },
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
      onboardingCompleted: { type: "boolean", required: false, defaultValue: false, input: false },
    },
  },
});
