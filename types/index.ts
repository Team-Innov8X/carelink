export type Role = 'dispatcher' | 'hospital' | 'pharmacy' | 'paramedic' | 'patient';

export interface BedAvailability {
  available: number;
  total: number;
  reserved?: number;
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
  specialtyDoctors?: Record<string, number>;
  status: HospitalStatus;
  lastUpdatedMinutesAgo: number; // Stale warning if > 10
  lastCapacityUpdatedAt?: string | Date;
  capacitySource?: string;
  acceptingRequests?: boolean;
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
  | 'Pending hospital confirmation'
  | 'Accepted'
  | 'Assigned'
  | 'En Route'
  | 'Arrived'
  | 'Handed over'
  | 'Handoff'
  | 'Timed out'
  | 'Rerouted'
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
  id: string;
  patientName: string;
  patientPhone?: string;
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
  acceptedAt?: string;
  enRouteAt?: string;
  arrivedAt?: string;
  handedOverAt?: string;
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
  isDemo?: boolean;
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
  minimumStock?: number;
  updatedAt?: string;
  isDemo?: boolean;
}

export interface Ambulance {
  id: string;
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

export interface AmbulanceDriver {
  id: string;
  name: string;
  phone: string;
  licenseNumber: string;
  ambulanceId: string;
  status: 'On Duty' | 'En Route' | 'Available';
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
