import { UserRole } from "@/lib/auth";

export interface IUser {
  _id?: string;
  id?: string;
  name: string;
  email: string;
  emailVerified?: boolean;
  image?: string;
  role: UserRole;
  hospitalId?: string; // Associated hospital ID (for hospital staff / dispatchers)
  phone?: string;
  vehicleNumber?: string; // For ambulance drivers
  status?: "available" | "busy" | "offline"; // Real-time operational status for drivers/staff
  createdAt: Date;
  updatedAt: Date;
}
