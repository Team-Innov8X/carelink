export type Role = 'dispatcher' | 'hospital' | 'pharmacy' | 'paramedic' | 'patient';

export interface BedAvailability {
  available: number;
  total: number;
}

export interface HospitalBeds {
  general: BedAvailability;
  icu: BedAvailability;
  trauma: BedAvailability;
  ventilators: BedAvailability;
}

export type HospitalStatus = 'Available' | 'Limited' | 'Full';

export interface Hospital {
  id: string;
  name: string;
  distanceKm: number;
  etaMin: number;
  beds: HospitalBeds;
  specialties: string[];
  status: HospitalStatus;
  lastUpdatedMinutesAgo: number; // Stale warning if > 10
  location: {
    lat: number;
    lng: number;
    address: string;
  };
  phone: string;
  rating: number;
}

export type PriorityLevel = 'Critical' | 'High' | 'Medium' | 'Low';

export type RequestStatus =
  | 'Finding hospital'
  | 'Pending'
  | 'Assigned'
  | 'En Route'
  | 'Handoff'
  | 'Completed'
  | 'Rejected';

export interface HandoffChecklist {
  arrivedAtHospital: boolean;
  detailsShared: boolean;
  vitalsHandedOver: boolean;
  bedConfirmed: boolean;
}

export interface PatientVitals {
  bp: string;
  heartRate: number;
  spO2: number;
  respirationRate?: number;
  bloodGroup?: string;
  conditionNotes: string;
}

export interface EmergencyRequest {
  id: string; // e.g. 'P-1023'
  patientName: string;
  age: number;
  gender: string;
  condition: string;
  priority: PriorityLevel;
  location: {
    lat: number;
    lng: number;
    address: string;
  };
  requiredFacilities: string[];
  etaLimitMin: number;
  status: RequestStatus;
  assignedHospitalId?: string;
  assignedAmbulanceId?: string;
  currentEtaMin?: number;
  vitals: PatientVitals;
  checklist: HandoffChecklist;
  requestedAt: string;
  doubleBookingConflict?: boolean;
}

export interface Pharmacy {
  id: string;
  name: string;
  distanceKm: number;
  address: string;
  phone: string;
  isOpen: boolean;
  location: {
    lat: number;
    lng: number;
  };
  rating: number;
}

export interface Medicine {
  id: string;
  name: string;
  form: string; // 'Tablets | 10 count'
  category: string;
  indication: string; // 'For: Infection'
  isEmergencyEssential: boolean;
  stock: Record<string, number>; // pharmacyId -> quantity
  price: string;
}

export interface Ambulance {
  id: string; // e.g. 'A-12'
  vehicleNumber: string;
  driverName: string;
  phone: string;
  status: 'On Duty' | 'En Route' | 'At Scene' | 'Available';
  location: {
    lat: number;
    lng: number;
  };
  assignedRequestId?: string;
}

export interface MedicineOrder {
  id: string;
  medicineId: string;
  medicineName: string;
  pharmacyId: string;
  pharmacyName: string;
  requestedBy: string;
  quantity: number;
  status: 'Requested' | 'Confirmed' | 'Ready for Pickup' | 'Dispatched';
  timestamp: string;
  isUrgent: boolean;
}
