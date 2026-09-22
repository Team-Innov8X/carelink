export interface IGeoLocation {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
}

export interface IHospitalAddress {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface IHospitalContact {
  phone: string;
  email: string;
  emergencyHotline: string;
}

export interface IHospitalCapacitySummary {
  totalBeds: number;
  availableBeds: number;
  totalVentilators: number;
  availableVentilators: number;
}

export interface IHospital {
  _id?: string;
  id?: string;
  name: string;
  code: string; // Unique hospital code (e.g. "HOSP-001")
  address: IHospitalAddress;
  location: IGeoLocation;
  contact: IHospitalContact;
  capacitySummary?: IHospitalCapacitySummary;
  status: "active" | "busy" | "full" | "inactive";
  createdAt: Date;
  updatedAt: Date;
}
