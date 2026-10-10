export type ClientSosRequest = {
  id: string;
  status: string;
  incidentType: string;
  createdAt: string;
  driverAssigned?: boolean;
  acceptedAt?: string;
  arrivedAt?: string | null;
  completedAt?: string;
  requestType?: 'emergency' | 'routine';
  patientPhone?: string;
  preferredTime?: string;
  notes?: string;
  rejectionReason?: string;
  requiredEquipment?: string[];
  tripStage?: string;
  fallbackInstruction?: string | null;
  vitalsUpdate?: { bp: string; heartRate: number; spO2: number } | null;
  destination?: { name: string; status: string; bedCategory?: string; rejectionReason?: string } | null;
};

let inFlight: Promise<ClientSosRequest[]> | null = null;

/** Reuse concurrent dashboard/status/history requests to avoid duplicate auth and DB reads. */
export function fetchPatientSosRequests(): Promise<ClientSosRequest[]> {
  if (inFlight) return inFlight;
  inFlight = fetch('/api/sos', { cache: 'no-store' })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load emergency requests.');
      return Array.isArray(data.requests) ? data.requests as ClientSosRequest[] : [];
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}
