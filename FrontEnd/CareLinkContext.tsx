import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Role,
  Hospital,
  EmergencyRequest,
  Pharmacy,
  Medicine,
  Ambulance,
  MedicineOrder,
  HospitalBeds,
  HandoffChecklist,
} from '../types';
import { INITIAL_HOSPITALS } from '../data/mockHospitals';
import { INITIAL_PHARMACIES } from '../data/mockPharmacies';
import { INITIAL_MEDICINES } from '../data/mockMedicines';
import { INITIAL_EMERGENCIES } from '../data/mockEmergencies';
import { INITIAL_AMBULANCES } from '../data/mockAmbulances';

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
  createNewEmergency: (emergency: Partial<EmergencyRequest>) => string;
  
  // Simulation controls
  isSimulationActive: boolean;
  toggleSimulation: () => void;
  triggerConflictDemo: () => void;
  triggerStaleDataDemo: () => void;
  resetAllData: () => void;
}

const CareLinkContext = createContext<CareLinkContextType | undefined>(undefined);

export const CareLinkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<Role>('dispatcher');
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [hospitals, setHospitals] = useState<Hospital[]>(() => {
    const saved = localStorage.getItem('carelink_hospitals');
    return saved ? JSON.parse(saved) : INITIAL_HOSPITALS;
  });
  const [emergencies, setEmergencies] = useState<EmergencyRequest[]>(() => {
    const saved = localStorage.getItem('carelink_emergencies');
    return saved ? JSON.parse(saved) : INITIAL_EMERGENCIES;
  });
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>(() => {
    const saved = localStorage.getItem('carelink_pharmacies');
    return saved ? JSON.parse(saved) : INITIAL_PHARMACIES;
  });
  const [medicines, setMedicines] = useState<Medicine[]>(() => {
    const saved = localStorage.getItem('carelink_medicines');
    return saved ? JSON.parse(saved) : INITIAL_MEDICINES;
  });
  const [ambulances, setAmbulances] = useState<Ambulance[]>(() => {
    const saved = localStorage.getItem('carelink_ambulances');
    return saved ? JSON.parse(saved) : INITIAL_AMBULANCES;
  });
  const [medicineOrders, setMedicineOrders] = useState<MedicineOrder[]>([]);
  const [selectedEmergencyId, setSelectedEmergencyId] = useState<string | null>('P-1023');
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('hosp-1');
  const [selectedPharmacyId, setSelectedPharmacyId] = useState<string>('pharm-1');
  const [doubleBookingConflict, setDoubleBookingConflict] = useState<DoubleBookingConflict | null>(null);
  const [isSimulationActive, setIsSimulationActive] = useState<boolean>(true);

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('carelink_hospitals', JSON.stringify(hospitals));
  }, [hospitals]);

  useEffect(() => {
    localStorage.setItem('carelink_emergencies', JSON.stringify(emergencies));
  }, [emergencies]);

  useEffect(() => {
    localStorage.setItem('carelink_medicines', JSON.stringify(medicines));
  }, [medicines]);

  // Live simulation ticker: updates ambulance positions and ETA countdown
  useEffect(() => {
    if (!isSimulationActive) return;

    const interval = setInterval(() => {
      // 1. Advance ETA for en-route emergencies
      setEmergencies((prev) =>
        prev.map((req) => {
          if (req.status === 'En Route' && req.currentEtaMin && req.currentEtaMin > 1) {
            return {
              ...req,
              currentEtaMin: req.currentEtaMin - 1,
            };
          }
          return req;
        })
      );

      // 2. Jitter ambulance GPS slightly to show live movement on the map
      setAmbulances((prev) =>
        prev.map((amb) => {
          if (amb.status === 'En Route' || amb.status === 'On Duty') {
            const latDelta = (Math.random() - 0.5) * 0.0008;
            const lngDelta = (Math.random() - 0.5) * 0.0008;
            return {
              ...amb,
              location: {
                lat: amb.location.lat + latDelta,
                lng: amb.location.lng + lngDelta,
              },
            };
          }
          return amb;
        })
      );
    }, 6000);

    return () => clearInterval(interval);
  }, [isSimulationActive]);

  // Bed Request with Concurrency Lock & Double Booking Prevention
  const requestHospitalBed = (requestId: string, hospitalId: string): boolean => {
    const targetHospital = hospitals.find((h) => h.id === hospitalId);
    if (!targetHospital) return false;

    // Trigger conflict if hospital has 0 trauma/ICU beds left, or simulated
    if (targetHospital.beds.trauma.available <= 0 && targetHospital.beds.icu.available <= 0) {
      setDoubleBookingConflict({
        isOpen: true,
        requestId,
        bedType: 'Trauma / ICU Bed',
        competingRequestId: 'P-1027',
        competingTime: '14:32',
        hospitalName: targetHospital.name,
        suggestedAlternatives: [
          {
            hospitalId: 'hosp-2',
            hospitalName: 'Sunrise Medical Center',
            bedType: 'ICU Bed',
            distanceKm: 8.5,
            etaMin: 12,
            availableCount: 2,
          },
          {
            hospitalId: 'hosp-3',
            hospitalName: 'Riverside Hospital',
            bedType: 'Trauma Bed',
            distanceKm: 11.3,
            etaMin: 14,
            availableCount: 2,
          },
        ],
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
            assignedAmbulanceId: 'A-12',
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

  const createNewEmergency = (data: Partial<EmergencyRequest>): string => {
    const newId = `P-${Math.floor(1028 + Math.random() * 900)}`;
    const newEmergency: EmergencyRequest = {
      id: newId,
      patientName: data.patientName || 'Emergency Patient',
      age: data.age || 38,
      gender: data.gender || 'Unknown',
      condition: data.condition || 'Acute Medical Emergency',
      priority: data.priority || 'High',
      location: data.location || {
        lat: 28.625,
        lng: 77.215,
        address: 'MG Road Junction, Central',
      },
      requiredFacilities: data.requiredFacilities || ['ICU', 'Ventilator'],
      etaLimitMin: data.etaLimitMin || 20,
      status: 'Finding hospital',
      currentEtaMin: 12,
      vitals: data.vitals || {
        bp: '110/70 mmHg',
        heartRate: 105,
        spO2: 92,
        conditionNotes: 'Reported via 112 emergency line.',
      },
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

  const toggleSimulation = () => {
    setIsSimulationActive((prev) => !prev);
  };

  const triggerConflictDemo = () => {
    setDoubleBookingConflict({
      isOpen: true,
      requestId: 'P-1024',
      bedType: 'ICU Bed',
      competingRequestId: 'P-1027',
      competingTime: '14:32',
      hospitalName: 'City Care Hospital',
      suggestedAlternatives: [
        {
          hospitalId: 'hosp-2',
          hospitalName: 'Sunrise Medical Center',
          bedType: 'ICU Bed',
          distanceKm: 8.5,
          etaMin: 12,
          availableCount: 2,
        },
        {
          hospitalId: 'hosp-3',
          hospitalName: 'Riverside Hospital',
          bedType: 'Trauma Bed',
          distanceKm: 11.3,
          etaMin: 14,
          availableCount: 2,
        },
      ],
    });
  };

  const triggerStaleDataDemo = () => {
    setHospitals((prev) =>
      prev.map((h) => (h.id === 'hosp-1' ? { ...h, lastUpdatedMinutesAgo: 16 } : h))
    );
  };

  const resetAllData = () => {
    localStorage.clear();
    setHospitals(INITIAL_HOSPITALS);
    setEmergencies(INITIAL_EMERGENCIES);
    setPharmacies(INITIAL_PHARMACIES);
    setMedicines(INITIAL_MEDICINES);
    setAmbulances(INITIAL_AMBULANCES);
    setMedicineOrders([]);
    setSelectedEmergencyId('P-1023');
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
        isSimulationActive,
        toggleSimulation,
        triggerConflictDemo,
        triggerStaleDataDemo,
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
