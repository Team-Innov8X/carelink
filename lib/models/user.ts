import type { UserRole } from "../auth";

export interface IUser {
  _id?: string;
  id?: string;
  name: string;
  email: string;
  emailVerified?: boolean;
  image?: string;
  role: UserRole;
  hospitalId?: string; // Associated hospital ID (for hospital staff / dispatchers)
  pharmacyId?: string; // Associated registered pharmacy ID
  phone?: string;
  vehicleNumber?: string; // For ambulance drivers
  status?: "available" | "busy" | "offline"; // Real-time operational status for drivers/staff
  onboardingCompleted?: boolean;
  createdAt: Date;
  updatedAt: Date;
}
