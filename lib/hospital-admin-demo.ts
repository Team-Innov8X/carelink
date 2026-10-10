'use client';

export type HospitalAdminDemoCase = {
  _id: string;
  sosRequestId: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  hospitalName: string;
  incidentType: string;
  requiredEquipment: string[];
  bedCategory: 'general' | 'icu' | 'trauma' | 'ventilators';
  requestType: 'sos';
  status: 'pending' | 'accepted' | 'rejected' | 'discharged';
  createdAt: string;
  admittedAt?: string;
  isDemo: true;
};

type DemoState = {
  cases: HospitalAdminDemoCase[];
  beds: Record<HospitalAdminDemoCase['bedCategory'], number>;
  activity?: DemoAuditEntry[];
};

export type DemoAuditEntry = { _id: string; action: string; actorName: string; details: Record<string, unknown>; createdAt: string; isDemo: true };

const STORAGE_KEY = 'carelink_hospital_admin_demo_v1';

function initialState(): DemoState {
  const now = Date.now();
  return {
    beds: { general: 11, icu: 4, trauma: 2, ventilators: 6 },
    cases: [
      {
        _id: 'demo-case-1024', sosRequestId: 'DEMO-1024', patientId: 'DEMO-1024',
        patientName: 'DEMO · Priya Mehra', patientPhone: '+91 98765 00124', hospitalName: 'City Care Hospital',
        incidentType: 'Severe respiratory distress', requiredEquipment: ['oxygen', 'respiratory specialist'],
        bedCategory: 'icu', requestType: 'sos', status: 'pending', createdAt: new Date(now - 4 * 60_000).toISOString(), isDemo: true,
      },
      {
        _id: 'demo-case-1025', sosRequestId: 'DEMO-1025', patientId: 'DEMO-1025',
        patientName: 'DEMO · Arjun Nair', patientPhone: '+91 98765 00125', hospitalName: 'City Care Hospital',
        incidentType: 'Orthopedic injury after fall', requiredEquipment: ['trauma care'],
        bedCategory: 'trauma', requestType: 'sos', status: 'pending', createdAt: new Date(now - 9 * 60_000).toISOString(), isDemo: true,
      },
      {
        _id: 'demo-case-1023', sosRequestId: 'DEMO-1023', patientId: 'DEMO-1023',
        patientName: 'DEMO · Sara Khan', patientPhone: '+91 98765 00123', hospitalName: 'City Care Hospital',
        incidentType: 'Dehydration and fever', requiredEquipment: [],
        bedCategory: 'general', requestType: 'sos', status: 'accepted', createdAt: new Date(now - 70 * 60_000).toISOString(),
        admittedAt: new Date(now - 45 * 60_000).toISOString(), isDemo: true,
      },
    ],
    activity: [
      { _id: 'demo-audit-1', action: 'Demo: bed inventory initialized', actorName: 'Demo Hospital Admin', details: { general: 11, icu: 4, trauma: 2 }, createdAt: new Date(now - 90 * 60_000).toISOString(), isDemo: true },
      { _id: 'demo-audit-2', action: 'Demo: Sara Khan admitted', actorName: 'Demo Hospital Admin', details: { bedCategory: 'general', patientName: 'DEMO · Sara Khan' }, createdAt: new Date(now - 45 * 60_000).toISOString(), isDemo: true },
      { _id: 'demo-audit-3', action: 'Demo: doctor roster reviewed', actorName: 'Demo Hospital Admin', details: { doctors: 3 }, createdAt: new Date(now - 25 * 60_000).toISOString(), isDemo: true },
    ],
  };
}

function readState(): DemoState {
  const fallback = initialState();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
      return fallback;
    }
    const parsed = JSON.parse(stored) as DemoState;
    if (!Array.isArray(parsed.cases) || !parsed.beds) throw new Error('Invalid demo state');
    if (!Array.isArray(parsed.activity)) parsed.activity = fallback.activity;
    return parsed;
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
    return fallback;
  }
}

function saveState(state: DemoState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event('hospital-admin-demo-updated'));
}

export function getHospitalAdminDemoCases() {
  return readState().cases;
}

function appendDemoActivity(state: DemoState, action: string, details: Record<string, unknown>) {
  state.activity ??= [];
  state.activity.unshift({ _id: `demo-audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, action: `Demo: ${action}`, actorName: 'Demo Hospital Admin', details, createdAt: new Date().toISOString(), isDemo: true });
  state.activity = state.activity.slice(0, 100);
}

export function getHospitalAdminDemoActivity() {
  return readState().activity ?? [];
}

export function resetHospitalAdminDemoData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initialState()));
  window.dispatchEvent(new Event('hospital-admin-demo-updated'));
}

export function getHospitalAdminDemoAdmissions() {
  return readState().cases
    .filter((item) => item.status === 'accepted' && item.admittedAt)
    .map((item) => ({
      _id: item._id,
      hospitalRequestId: item._id,
      patientId: item.patientId,
      patientName: item.patientName,
      patientPhone: item.patientPhone,
      incidentType: item.incidentType,
      bedCategory: item.bedCategory,
      admittedAt: item.admittedAt!,
      isDemo: true as const,
    }));
}

export function acceptHospitalAdminDemoCase(id: string) {
  const state = readState();
  const item = state.cases.find((candidate) => candidate._id === id && candidate.status === 'pending');
  if (!item) return { success: false, message: 'This demo case is no longer waiting.' };
  if (state.beds[item.bedCategory] < 1) return { success: false, message: `No demo ${item.bedCategory} bed is available.` };
  state.beds[item.bedCategory] -= 1;
  item.status = 'accepted';
  item.admittedAt = new Date().toISOString();
  appendDemoActivity(state, `${item.patientName} accepted and admitted`, { bedCategory: item.bedCategory, patientName: item.patientName });
  saveState(state);
  return { success: true, message: `${item.patientName} accepted and admitted to a demo ${item.bedCategory} bed.` };
}

export function rejectHospitalAdminDemoCase(id: string) {
  const state = readState();
  const item = state.cases.find((candidate) => candidate._id === id && candidate.status === 'pending');
  if (!item) return { success: false, message: 'This demo case is no longer waiting.' };
  item.status = 'rejected';
  appendDemoActivity(state, `${item.patientName} case rejected`, { bedCategory: item.bedCategory, patientName: item.patientName });
  saveState(state);
  return { success: true, message: `${item.patientName}'s demo case was rejected.` };
}

export function dischargeHospitalAdminDemoCase(id: string) {
  const state = readState();
  const item = state.cases.find((candidate) => candidate._id === id && candidate.status === 'accepted');
  if (!item) return false;
  item.status = 'discharged';
  state.beds[item.bedCategory] += 1;
  appendDemoActivity(state, `${item.patientName} discharged`, { bedCategory: item.bedCategory, patientName: item.patientName });
  saveState(state);
  return true;
}
