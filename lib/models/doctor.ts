import type { ObjectId } from "mongodb";

export type DoctorAvailability = "available" | "on_call" | "off_duty";

export interface IDoctor {
  _id?: ObjectId | string;
  id?: string;
  hospitalId: string;
  name: string;
  qualification: string;
  specialization: string;
  availability: DoctorAvailability;
  phone?: string;
  experienceYears?: number;
  createdAt?: Date;
  updatedAt: Date;
}
