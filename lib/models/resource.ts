export type ResourceType = "bed" | "equipment" | "specialist";

export type BedCategory = "icu" | "general" | "pediatric" | "emergency" | "isolation";
export type EquipmentCategory =
  | "ventilator"
  | "defibrillator"
  | "oxygen_cylinder"
  | "dialysis_machine"
  | "ecg_monitor";
export type SpecialistCategory =
  | "cardiologist"
  | "neurologist"
  | "trauma_surgeon"
  | "anesthesiologist"
  | "pediatrician";

export type ResourceCategory = BedCategory | EquipmentCategory | SpecialistCategory | string;

export interface IResource {
  _id?: ObjectId | string;
  id?: string;
  hospitalId: string;
  type: ResourceType;
  category: ResourceCategory;
  name: string;
  description?: string;
  totalQuantity: number;
  availableQuantity: number;
  heldQuantity: number; // Currently reserved/held by pending requests
  status: "available" | "limited" | "unavailable";
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
import type { ObjectId } from "mongodb";
