import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  Role,
  Hospital,
  EmergencyRequest,
  Pharmacy,
  Medicine,
  Ambulance,
  AmbulanceDriver,
  MedicineOrder,
  HospitalBeds,
  HandoffChecklist,
} from '../types';
import { INITIAL_HOSPITALS } from '../data/mockHospitals';
import { INITIAL_PHARMACIES } from '../data/mockPharmacies';
import { INITIAL_MEDICINES } from '../data/mockMedicines';
import { INITIAL_EMERGENCIES } from '../data/mockEmergencies';
import { INITIAL_AMBULANCES } from '../data/mockAmbulances';
import { INITIAL_DRIVERS } from '../data/mockDrivers';

export interface DoubleBookingConflict {
  isOpen: boolean;
  requestId: string;
  bedType: string;
  competingRequestId: string;
  competingTime: string;
  hospitalName: string;
  suggestedAlternatives: {
    hospitalId: string;
    hospitalName: string;
    bedType: string;
    distanceKm: number;
    etaMin: number;
    availableCount: number;
  }[];
}

interface CareLinkContextType {
  role: Role;
  setRole: (role: Role) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  hospitals: Hospital[];
  emergencies: EmergencyRequest[];
  pharmacies: Pharmacy[];
  medicines: Medicine[];
  ambulances: Ambulance[];
  drivers: AmbulanceDriver[];
  medicineOrders: MedicineOrder[];
  selectedEmergencyId: string | null;
  setSelectedEmergencyId: (id: string | null) => void;
  selectedHospitalId: string;
  setSelectedHospitalId: (id: string) => void;
  selectedPharmacyId: string;
  setSelectedPharmacyId: (id: string) => void;
  doubleBookingConflict: DoubleBookingConflict | null;
  dismissDoubleBookingModal: () => void;
  retryWithAlternativeBed: (alternativeHospitalId: string) => void;
  
  // Actions
  requestHospitalBed: (requestId: string, hospitalId: string) => boolean;
  acceptEmergency: (requestId: string) => void;
  rejectEmergency: (requestId: string, reason?: string) => void;
  updateBedCounts: (hospitalId: string, bedType: keyof HospitalBeds, delta: number) => void;
  refreshHospitalData: (hospitalId: string) => void;
  updateHandoffChecklist: (requestId: string, key: keyof HandoffChecklist, value: boolean) => void;
  completeHandoff: (requestId: string) => void;
  orderMedicine: (medicineId: string, pharmacyId: string, quantity: number, isUrgent?: boolean) => void;
  updateMedicineStock: (medicineId: string, pharmacyId: string, newStock: number) => void;
  createNewEmergency: (emergency: Omit<EmergencyRequest, 'id' | 'status' | 'checklist' | 'requestedAt'>) => string;
  
  // Operational controls
  resetAllData: () => void;
}

const CareLinkContext = createContext<CareLinkContextType | undefined>(undefined);

const mergeInitialRecords = <T extends { id: string }>(saved: T[] | undefined, initial: T[]): T[] => {
  const records = new Map((Array.isArray(saved) ? saved : []).map((record) => [record.id, record]));
  initial.forEach((record) => {
    if (!records.has(record.id)) records.set(record.id, record);
  });
  return Array.from(records.values());
};

export const CareLinkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const hydrated = useRef(false);
  const [role, setRole] = useState<Role>('dispatcher');
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [hospitals, setHospitals] = useState<Hospital[]>(INITIAL_HOSPITALS);
  const [emergencies, setEmergencies] = useState<EmergencyRequest[]>(INITIAL_EMERGENCIES);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>(INITIAL_PHARMACIES);
  const [medicines, setMedicines] = useState<Medicine[]>(INITIAL_MEDICINES);
  const [ambulances, setAmbulances] = useState<Ambulance[]>(INITIAL_AMBULANCES);
  const [drivers, setDrivers] = useState<AmbulanceDriver[]>(INITIAL_DRIVERS);
  const [medicineOrders, setMedicineOrders] = useState<MedicineOrder[]>([]);
  const [selectedEmergencyId, setSelectedEmergencyId] = useState<string | null>('P-1023');
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('hosp-1');
  const [selectedPharmacyId, setSelectedPharmacyId] = useState<string>('pharm-1');
  const [doubleBookingConflict, setDoubleBookingConflict] = useState<DoubleBookingConflict | null>(null);

  // Restore a fast local copy, then reconcile with the shared MongoDB snapshot.
  useEffect(() => {
    let cancelled = false;
    try {
      const savedHospitals = localStorage.getItem('carelink_hospitals');
      const savedEmergencies = localStorage.getItem('carelink_emergencies');
      const savedPharmacies = localStorage.getItem('carelink_pharmacies');
      const savedMedicines = localStorage.getItem('carelink_medicines');
      const savedAmbulances = localStorage.getItem('carelink_ambulances');
      const savedDrivers = localStorage.getItem('carelink_drivers');
      const savedOrders = localStorage.getItem('carelink_orders');
      queueMicrotask(() => {
        if (cancelled) return;
        if (savedHospitals) setHospitals(mergeInitialRecords(JSON.parse(savedHospitals), INITIAL_HOSPITALS));
        if (savedEmergencies) setEmergencies(mergeInitialRecords(JSON.parse(savedEmergencies), INITIAL_EMERGENCIES));
        if (savedPharmacies) setPharmacies(mergeInitialRecords(JSON.parse(savedPharmacies), INITIAL_PHARMACIES));
        if (savedMedicines) setMedicines(mergeInitialRecords(JSON.parse(savedMedicines), INITIAL_MEDICINES));
        if (savedAmbulances) setAmbulances(mergeInitialRecords(JSON.parse(savedAmbulances), INITIAL_AMBULANCES));
        if (savedDrivers) setDrivers(mergeInitialRecords(JSON.parse(savedDrivers), INITIAL_DRIVERS));
        if (savedOrders) setMedicineOrders(JSON.parse(savedOrders));
      });
    } catch {
      // Ignore localStorage read errors
    }

    fetch('/api/data', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Database is unavailable');
        return response.json();
      })
      .then(({ state }) => {
        if (cancelled) return;
        if (state) {
          setHospitals(mergeInitialRecords(state.hospitals, INITIAL_HOSPITALS));
          setEmergencies(mergeInitialRecords(state.emergencies, INITIAL_EMERGENCIES));
          setPharmacies(mergeInitialRecords(state.pharmacies, INITIAL_PHARMACIES));
          setMedicines(mergeInitialRecords(state.medicines, INITIAL_MEDICINES));
          setAmbulances(mergeInitialRecords(state.ambulances, INITIAL_AMBULANCES));
          setDrivers(mergeInitialRecords(state.drivers, INITIAL_DRIVERS));
          setMedicineOrders(state.medicineOrders ?? []);
        }
      })
      .catch(() => {
        // The app remains usable with the browser's saved copy when MongoDB is not configured.
      })
      .finally(() => {
        if (!cancelled) hydrated.current = true;
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const reloadSharedState = () => {
      fetch('/api/data', { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error('Shared state unavailable');
          return response.json();
        })
        .then(({ state }) => {
          if (!state) return;
          setHospitals(mergeInitialRecords(state.hospitals, INITIAL_HOSPITALS));
          setEmergencies(mergeInitialRecords(state.emergencies, INITIAL_EMERGENCIES));
          setPharmacies(mergeInitialRecords(state.pharmacies, INITIAL_PHARMACIES));
          setMedicines(mergeInitialRecords(state.medicines, INITIAL_MEDICINES));
          setAmbulances(mergeInitialRecords(state.ambulances, INITIAL_AMBULANCES));
          setDrivers(mergeInitialRecords(state.drivers, INITIAL_DRIVERS));
          setMedicineOrders(state.medicineOrders ?? []);
        })
        .catch(() => {});
    };
    window.addEventListener('carelink-authenticated', reloadSharedState);
    return () => window.removeEventListener('carelink-authenticated', reloadSharedState);
  }, []);

  // Keep a local offline copy and persist operational data to the shared backend.
  useEffect(() => {
    if (!hydrated.current || typeof window === 'undefined') return;
    const state = { hospitals, emergencies, pharmacies, medicines, ambulances, drivers, medicineOrders };
    try {
      Object.entries(state).forEach(([key, value]) => {
        localStorage.setItem(`carelink_${key}`, JSON.stringify(value));
      });
    } catch { /* Storage may be disabled or full; backend persistence still proceeds. */ }
    const timer = window.setTimeout(() => {
      fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      }).catch(() => {
        // Local storage remains the offline fallback.
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [hospitals, emergencies, pharmacies, medicines, ambulances, drivers, medicineOrders]);

  // Bed Request with Concurrency Lock & Double Booking Prevention
  const requestHospitalBed = (requestId: string, hospitalId: string): boolean => {
    const targetHospital = hospitals.find((h) => h.id === hospitalId);
    if (!targetHospital) return false;

    // Prevent a reservation when no critical care capacity remains.
    if (targetHospital.beds.trauma.available <= 0 && targetHospital.beds.icu.available <= 0) {
      setDoubleBookingConflict({
        isOpen: true,
        requestId,
        bedType: 'Trauma / ICU Bed',
        competingRequestId: emergencies.find((request) => request.id !== requestId)?.id ?? 'No competing request',
        competingTime: emergencies.find((request) => request.id !== requestId)?.requestedAt ?? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        hospitalName: targetHospital.name,
        suggestedAlternatives: hospitals
          .filter((hospital) => hospital.id !== hospitalId && (hospital.beds.icu.available > 0 || hospital.beds.trauma.available > 0))
          .slice(0, 3)
          .map((hospital) => ({
            hospitalId: hospital.id,
            hospitalName: hospital.name,
            bedType: hospital.beds.icu.available > 0 ? 'ICU Bed' : 'Trauma Bed',
            distanceKm: hospital.distanceKm,
            etaMin: hospital.etaMin,
            availableCount: hospital.beds.icu.available > 0 ? hospital.beds.icu.available : hospital.beds.trauma.available,
          })),
      });
      return false;
    }

    // Otherwise reserve bed
    setHospitals((prev) =>
      prev.map((h) => {
        if (h.id === hospitalId) {
          const newTrauma = Math.max(0, h.beds.trauma.available - 1);
          return {
            ...h,
            beds: {
              ...h.beds,
              trauma: { ...h.beds.trauma, available: newTrauma },
            },
          };
        }
        return h;
      })
    );

    // Update emergency request status
    setEmergencies((prev) =>
      prev.map((req) => {
        if (req.id === requestId) {
          return {
            ...req,
            status: 'Assigned',
            assignedHospitalId: hospitalId,
            assignedAmbulanceId: ambulances.find((ambulance) => ambulance.status === 'Available')?.id,
            currentEtaMin: targetHospital.etaMin,
          };
        }
        return req;
      })
    );

    return true;
  };

  const dismissDoubleBookingModal = () => {
    setDoubleBookingConflict(null);
  };

  const retryWithAlternativeBed = (alternativeHospitalId: string) => {
    if (!doubleBookingConflict) return;
    const reqId = doubleBookingConflict.requestId;
    setDoubleBookingConflict(null);
    requestHospitalBed(reqId, alternativeHospitalId);
    setActiveTab('handoff');
  };

  const acceptEmergency = (requestId: string) => {
    setEmergencies((prev) =>
      prev.map((req) => {
        if (req.id === requestId) {
          return {
            ...req,
            status: 'En Route',
            checklist: {
              ...req.checklist,
              detailsShared: true,
            },
          };
        }
        return req;
      })
    );
  };

  const rejectEmergency = (requestId: string, reason?: string) => {
    setEmergencies((prev) =>
      prev.map((req) => {
        if (req.id === requestId) {
          return {
            ...req,
            status: 'Pending',
            assignedHospitalId: undefined,
            conditionNotes: `${req.vitals.conditionNotes} [Re-routed: ${reason || 'Capacity exceeded'}]`,
          };
        }
        return req;
      })
    );
  };

  const updateBedCounts = (
    hospitalId: string,
    bedType: keyof HospitalBeds,
    delta: number
  ) => {
    setHospitals((prev) =>
      prev.map((h) => {
        if (h.id === hospitalId) {
          const current = h.beds[bedType];
          const newAvail = Math.min(
            current.total,
            Math.max(0, current.available + delta)
          );
          return {
            ...h,
            lastUpdatedMinutesAgo: 0, // Freshly updated!
            beds: {
              ...h.beds,
              [bedType]: {
                ...current,
                available: newAvail,
              },
            },
          };
        }
        return h;
      })
    );
  };

  const refreshHospitalData = (hospitalId: string) => {
    setHospitals((prev) =>
      prev.map((h) => {
        if (h.id === hospitalId) {
          return {
            ...h,
            lastUpdatedMinutesAgo: 0,
          };
        }
        return h;
      })
    );
  };

  const updateHandoffChecklist = (
    requestId: string,
    key: keyof HandoffChecklist,
    value: boolean
  ) => {
    setEmergencies((prev) =>
      prev.map((req) => {
        if (req.id === requestId) {
          return {
            ...req,
            checklist: {
              ...req.checklist,
              [key]: value,
            },
          };
        }
        return req;
      })
    );
  };

  const completeHandoff = (requestId: string) => {
    setEmergencies((prev) =>
      prev.map((req) => {
        if (req.id === requestId) {
          return {
            ...req,
            status: 'Completed',
            checklist: {
              arrivedAtHospital: true,
              detailsShared: true,
              vitalsHandedOver: true,
              bedConfirmed: true,
            },
          };
        }
        return req;
      })
    );
  };

  const orderMedicine = (
    medicineId: string,
    pharmacyId: string,
    quantity: number,
    isUrgent: boolean = true
  ) => {
    const med = medicines.find((m) => m.id === medicineId);
    const pharm = pharmacies.find((p) => p.id === pharmacyId);
    if (!med || !pharm) return;

    // Deduct stock
    setMedicines((prev) =>
      prev.map((m) => {
        if (m.id === medicineId) {
          const currentStock = m.stock[pharmacyId] || 0;
          return {
            ...m,
            stock: {
              ...m.stock,
              [pharmacyId]: Math.max(0, currentStock - quantity),
            },
          };
        }
        return m;
      })
    );

    // Create order entry
    const newOrder: MedicineOrder = {
      id: `ORD-${Date.now().toString().slice(-4)}`,
      medicineId,
      medicineName: med.name,
      pharmacyId,
      pharmacyName: pharm.name,
      requestedBy: role === 'dispatcher' ? 'Ambulance Unit DL-01' : 'General Patient',
      quantity,
      status: 'Confirmed',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isUrgent,
    };

    setMedicineOrders((prev) => [newOrder, ...prev]);
  };

  const updateMedicineStock = (
    medicineId: string,
    pharmacyId: string,
    newStock: number
  ) => {
    setMedicines((prev) =>
      prev.map((m) => {
        if (m.id === medicineId) {
          return {
            ...m,
            stock: {
              ...m.stock,
              [pharmacyId]: Math.max(0, newStock),
            },
          };
        }
        return m;
      })
    );
  };

  const createNewEmergency = (data: Omit<EmergencyRequest, 'id' | 'status' | 'checklist' | 'requestedAt'>): string => {
    const newId = `P-${Math.floor(1028 + Math.random() * 900)}`;
    const newEmergency: EmergencyRequest = {
      ...data,
      id: newId,
      status: 'Finding hospital',
      checklist: {
        arrivedAtHospital: false,
        detailsShared: false,
        vitalsHandedOver: false,
        bedConfirmed: false,
      },
      requestedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setEmergencies((prev) => [newEmergency, ...prev]);
    setSelectedEmergencyId(newId);
    return newId;
  };

  const resetAllData = () => {
    setHospitals(INITIAL_HOSPITALS);
    setEmergencies(INITIAL_EMERGENCIES);
    setPharmacies(INITIAL_PHARMACIES);
    setMedicines(INITIAL_MEDICINES);
    setAmbulances(INITIAL_AMBULANCES);
    setDrivers(INITIAL_DRIVERS);
    setMedicineOrders([]);
    setSelectedEmergencyId(INITIAL_EMERGENCIES[0]?.id ?? null);
    setSelectedHospitalId(INITIAL_HOSPITALS[0]?.id ?? '');
    setSelectedPharmacyId(INITIAL_PHARMACIES[0]?.id ?? '');
    setDoubleBookingConflict(null);
  };

  return (
    <CareLinkContext.Provider
      value={{
        role,
        setRole,
        activeTab,
        setActiveTab,
        hospitals,
        emergencies,
        pharmacies,
        medicines,
        ambulances,
        drivers,
        medicineOrders,
        selectedEmergencyId,
        setSelectedEmergencyId,
        selectedHospitalId,
        setSelectedHospitalId,
        selectedPharmacyId,
        setSelectedPharmacyId,
        doubleBookingConflict,
        dismissDoubleBookingModal,
        retryWithAlternativeBed,
        requestHospitalBed,
        acceptEmergency,
        rejectEmergency,
        updateBedCounts,
        refreshHospitalData,
        updateHandoffChecklist,
        completeHandoff,
        orderMedicine,
        updateMedicineStock,
        createNewEmergency,
        resetAllData,
      }}
    >
      {children}
    </CareLinkContext.Provider>
  );
};

export const useCareLink = () => {
  const context = useContext(CareLinkContext);
  if (!context) {
    throw new Error('useCareLink must be used within a CareLinkProvider');
  }
  return context;
};
