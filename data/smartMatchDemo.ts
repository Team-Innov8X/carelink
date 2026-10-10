/**
 * Isolated, fictional inventory for the Smart Match demo fallback only.
 * These records are never inserted into MongoDB or exposed by other APIs.
 */
export const SMART_MATCH_DEMO_HOSPITALS = [
  {
    id: 'smart-match-demo-hospital-1', code: 'SM-DEMO-001', name: 'CareLink Demo Hospital — Delhi Central',
    address: { street: '42 Health City Boulevard', city: 'New Delhi', state: 'Delhi', zipCode: '110001', country: 'India' },
    location: { type: 'Point' as const, coordinates: [77.209, 28.6139] as [number, number] },
    demoTravelTimeMinutes: 12,
    status: 'active', isDemo: true,
  },
  {
    id: 'smart-match-demo-hospital-2', code: 'SM-DEMO-002', name: 'CareLink Demo Hospital — Delhi Northside',
    address: { street: '18 Community Health Road', city: 'New Delhi', state: 'Delhi', zipCode: '110009', country: 'India' },
    location: { type: 'Point' as const, coordinates: [77.205, 28.625] as [number, number] },
    demoTravelTimeMinutes: 20,
    status: 'active', isDemo: true,
  },
  {
    id: 'smart-match-demo-hospital-3', code: 'SM-DEMO-003', name: 'CareLink Demo Hospital — Pune Central',
    address: { street: '12 Sample Health Avenue', city: 'Pune', state: 'Maharashtra', zipCode: '411001', country: 'India' },
    location: { type: 'Point' as const, coordinates: [73.8567, 18.5204] as [number, number] },
    demoTravelTimeMinutes: 14,
    status: 'active', isDemo: true,
  },
  {
    id: 'smart-match-demo-hospital-4', code: 'SM-DEMO-004', name: 'CareLink Demo Hospital — Pune Westside',
    address: { street: '28 Sample Community Road', city: 'Pune', state: 'Maharashtra', zipCode: '411045', country: 'India' },
    location: { type: 'Point' as const, coordinates: [73.8077, 18.5679] as [number, number] },
    demoTravelTimeMinutes: 28,
    status: 'active', isDemo: true,
  },
  {
    id: 'smart-match-demo-hospital-5', code: 'SM-DEMO-005', name: 'CareLink Demo Hospital — Delhi East',
    address: { street: '7 Sample Riverside Road', city: 'New Delhi', state: 'Delhi', zipCode: '110092', country: 'India' },
    location: { type: 'Point' as const, coordinates: [77.276, 28.638] as [number, number] },
    demoTravelTimeMinutes: 25,
    status: 'active', isDemo: true,
  },
  {
    id: 'smart-match-demo-hospital-6', code: 'SM-DEMO-006', name: 'CareLink Demo Hospital — Pune Eastside',
    address: { street: '15 Sample Garden Road', city: 'Pune', state: 'Maharashtra', zipCode: '411014', country: 'India' },
    location: { type: 'Point' as const, coordinates: [73.895, 18.552] as [number, number] },
    demoTravelTimeMinutes: 18,
    status: 'active', isDemo: true,
  },
];

export const SMART_MATCH_DEMO_RESOURCES = [
  { id: 'smart-match-demo-resource-1', hospitalId: 'smart-match-demo-hospital-1', type: 'bed', category: 'general', name: 'Demo general beds', totalQuantity: 20, availableQuantity: 8, status: 'available' },
  { id: 'smart-match-demo-resource-2', hospitalId: 'smart-match-demo-hospital-1', type: 'bed', category: 'icu', name: 'Demo ICU beds', totalQuantity: 8, availableQuantity: 3, status: 'available' },
  { id: 'smart-match-demo-resource-3', hospitalId: 'smart-match-demo-hospital-1', type: 'bed', category: 'trauma', name: 'Demo trauma beds', totalQuantity: 4, availableQuantity: 2, status: 'available' },
  { id: 'smart-match-demo-resource-4', hospitalId: 'smart-match-demo-hospital-1', type: 'specialist', category: 'cardiologist', name: 'Demo cardiology service', totalQuantity: 1, availableQuantity: 1, status: 'available' },
  { id: 'smart-match-demo-resource-5', hospitalId: 'smart-match-demo-hospital-1', type: 'equipment', category: 'defibrillator', name: 'Demo defibrillator', totalQuantity: 2, availableQuantity: 1, status: 'available' },
  { id: 'smart-match-demo-resource-6', hospitalId: 'smart-match-demo-hospital-1', type: 'specialist', category: 'trauma_surgeon', name: 'Demo trauma service', totalQuantity: 1, availableQuantity: 1, status: 'available' },
  { id: 'smart-match-demo-resource-7', hospitalId: 'smart-match-demo-hospital-2', type: 'bed', category: 'general', name: 'Demo general beds', totalQuantity: 16, availableQuantity: 6, status: 'available' },
  { id: 'smart-match-demo-resource-8', hospitalId: 'smart-match-demo-hospital-2', type: 'bed', category: 'pediatric', name: 'Demo pediatric beds', totalQuantity: 6, availableQuantity: 2, status: 'available' },
  { id: 'smart-match-demo-resource-9', hospitalId: 'smart-match-demo-hospital-2', type: 'bed', category: 'icu', name: 'Demo ICU beds', totalQuantity: 4, availableQuantity: 1, status: 'available' },
  { id: 'smart-match-demo-resource-10', hospitalId: 'smart-match-demo-hospital-2', type: 'specialist', category: 'pediatrician', name: 'Demo pediatric service', totalQuantity: 1, availableQuantity: 1, status: 'available' },
  { id: 'smart-match-demo-resource-11', hospitalId: 'smart-match-demo-hospital-3', type: 'bed', category: 'general', name: 'Demo general beds', totalQuantity: 24, availableQuantity: 9, status: 'available' },
  { id: 'smart-match-demo-resource-12', hospitalId: 'smart-match-demo-hospital-3', type: 'bed', category: 'icu', name: 'Demo ICU beds', totalQuantity: 10, availableQuantity: 3, status: 'available' },
  { id: 'smart-match-demo-resource-13', hospitalId: 'smart-match-demo-hospital-3', type: 'bed', category: 'trauma', name: 'Demo trauma beds', totalQuantity: 5, availableQuantity: 2, status: 'available' },
  { id: 'smart-match-demo-resource-14', hospitalId: 'smart-match-demo-hospital-3', type: 'specialist', category: 'cardiologist', name: 'Demo cardiology service', totalQuantity: 1, availableQuantity: 1, status: 'available' },
  { id: 'smart-match-demo-resource-15', hospitalId: 'smart-match-demo-hospital-3', type: 'equipment', category: 'defibrillator', name: 'Demo defibrillator', totalQuantity: 2, availableQuantity: 1, status: 'available' },
  { id: 'smart-match-demo-resource-16', hospitalId: 'smart-match-demo-hospital-4', type: 'bed', category: 'general', name: 'Demo general beds', totalQuantity: 18, availableQuantity: 7, status: 'available' },
  { id: 'smart-match-demo-resource-17', hospitalId: 'smart-match-demo-hospital-4', type: 'bed', category: 'pediatric', name: 'Demo pediatric beds', totalQuantity: 6, availableQuantity: 2, status: 'available' },
  { id: 'smart-match-demo-resource-18', hospitalId: 'smart-match-demo-hospital-4', type: 'bed', category: 'icu', name: 'Demo ICU beds', totalQuantity: 4, availableQuantity: 1, status: 'available' },
  { id: 'smart-match-demo-resource-19', hospitalId: 'smart-match-demo-hospital-4', type: 'specialist', category: 'pediatrician', name: 'Demo pediatric service', totalQuantity: 1, availableQuantity: 1, status: 'available' },
  { id: 'smart-match-demo-resource-20', hospitalId: 'smart-match-demo-hospital-5', type: 'bed', category: 'general', name: 'Demo general beds', totalQuantity: 18, availableQuantity: 5, status: 'available' },
  { id: 'smart-match-demo-resource-21', hospitalId: 'smart-match-demo-hospital-5', type: 'bed', category: 'emergency', name: 'Demo emergency beds', totalQuantity: 5, availableQuantity: 2, status: 'available' },
  { id: 'smart-match-demo-resource-22', hospitalId: 'smart-match-demo-hospital-5', type: 'equipment', category: 'oxygen_cylinder', name: 'Demo oxygen cylinders', totalQuantity: 8, availableQuantity: 4, status: 'available' },
  { id: 'smart-match-demo-resource-23', hospitalId: 'smart-match-demo-hospital-5', type: 'specialist', category: 'neurologist', name: 'Demo neurology service', totalQuantity: 1, availableQuantity: 1, status: 'available' },
  { id: 'smart-match-demo-resource-24', hospitalId: 'smart-match-demo-hospital-5', type: 'bed', category: 'icu', name: 'Demo ICU beds', totalQuantity: 5, availableQuantity: 1, status: 'available' },
  { id: 'smart-match-demo-resource-25', hospitalId: 'smart-match-demo-hospital-6', type: 'bed', category: 'general', name: 'Demo general beds', totalQuantity: 20, availableQuantity: 8, status: 'available' },
  { id: 'smart-match-demo-resource-26', hospitalId: 'smart-match-demo-hospital-6', type: 'bed', category: 'pediatric', name: 'Demo pediatric beds', totalQuantity: 7, availableQuantity: 3, status: 'available' },
  { id: 'smart-match-demo-resource-27', hospitalId: 'smart-match-demo-hospital-6', type: 'bed', category: 'trauma', name: 'Demo trauma beds', totalQuantity: 4, availableQuantity: 1, status: 'available' },
  { id: 'smart-match-demo-resource-28', hospitalId: 'smart-match-demo-hospital-6', type: 'equipment', category: 'oxygen_cylinder', name: 'Demo oxygen cylinders', totalQuantity: 6, availableQuantity: 2, status: 'available' },
  { id: 'smart-match-demo-resource-29', hospitalId: 'smart-match-demo-hospital-6', type: 'specialist', category: 'trauma_surgeon', name: 'Demo trauma service', totalQuantity: 1, availableQuantity: 1, status: 'available' },
];

export const SMART_MATCH_DEMO_PHARMACIES = [
  { id: 'smart-match-demo-pharmacy-1', name: 'CareLink Demo Pharmacy — Delhi Market', address: '8 Market Lane, New Delhi', location: { lat: 28.615, lng: 77.212 }, isDemo: true },
  { id: 'smart-match-demo-pharmacy-2', name: 'CareLink Demo Pharmacy — Delhi Northside', address: '21 Community Road, New Delhi', location: { lat: 28.626, lng: 77.207 }, isDemo: true },
  { id: 'smart-match-demo-pharmacy-3', name: 'CareLink Demo Pharmacy — Pune Central', address: '6 Sample Market Street, Pune', location: { lat: 18.5204, lng: 73.8567 }, isDemo: true },
  { id: 'smart-match-demo-pharmacy-4', name: 'CareLink Demo Pharmacy — Pune Westside', address: '31 Sample West Road, Pune', location: { lat: 18.5679, lng: 73.8077 }, isDemo: true },
  { id: 'smart-match-demo-pharmacy-5', name: 'CareLink Demo Pharmacy — Delhi East', address: '9 Sample Riverside Road, New Delhi', location: { lat: 28.64, lng: 77.272 }, isDemo: true },
  { id: 'smart-match-demo-pharmacy-6', name: 'CareLink Demo Pharmacy — Pune Eastside', address: '4 Sample Garden Road, Pune', location: { lat: 18.552, lng: 73.895 }, isDemo: true },
];

export const SMART_MATCH_DEMO_MEDICINES = [
  { id: 'smart-match-demo-medicine-1', name: 'Paracetamol 500 mg', form: 'tablet', stock: { 'smart-match-demo-pharmacy-1': 40, 'smart-match-demo-pharmacy-2': 18, 'smart-match-demo-pharmacy-3': 32, 'smart-match-demo-pharmacy-4': 15, 'smart-match-demo-pharmacy-5': 24, 'smart-match-demo-pharmacy-6': 21 }, isDemo: true },
  { id: 'smart-match-demo-medicine-2', name: 'Salbutamol 100 mcg', form: 'inhaler', stock: { 'smart-match-demo-pharmacy-1': 12, 'smart-match-demo-pharmacy-2': 7, 'smart-match-demo-pharmacy-3': 10, 'smart-match-demo-pharmacy-4': 6, 'smart-match-demo-pharmacy-5': 8, 'smart-match-demo-pharmacy-6': 9 }, isDemo: true },
  { id: 'smart-match-demo-medicine-3', name: 'Amoxicillin 500 mg', form: 'capsule', stock: { 'smart-match-demo-pharmacy-1': 20, 'smart-match-demo-pharmacy-2': 9, 'smart-match-demo-pharmacy-3': 16, 'smart-match-demo-pharmacy-4': 8, 'smart-match-demo-pharmacy-5': 14, 'smart-match-demo-pharmacy-6': 11 }, isDemo: true },
  { id: 'smart-match-demo-medicine-4', name: 'Paracetamol 650 mg', form: 'tablet', stock: { 'smart-match-demo-pharmacy-1': 18, 'smart-match-demo-pharmacy-2': 12, 'smart-match-demo-pharmacy-3': 16, 'smart-match-demo-pharmacy-4': 10, 'smart-match-demo-pharmacy-5': 15, 'smart-match-demo-pharmacy-6': 14 }, isDemo: true },
  { id: 'smart-match-demo-medicine-5', name: 'Cetirizine 10 mg', form: 'tablet', stock: { 'smart-match-demo-pharmacy-1': 22, 'smart-match-demo-pharmacy-2': 17, 'smart-match-demo-pharmacy-3': 20, 'smart-match-demo-pharmacy-4': 13, 'smart-match-demo-pharmacy-5': 16, 'smart-match-demo-pharmacy-6': 12 }, isDemo: true },
  { id: 'smart-match-demo-medicine-6', name: 'Oral Rehydration Salts', form: 'sachet', stock: { 'smart-match-demo-pharmacy-1': 30, 'smart-match-demo-pharmacy-2': 24, 'smart-match-demo-pharmacy-3': 26, 'smart-match-demo-pharmacy-4': 18, 'smart-match-demo-pharmacy-5': 21, 'smart-match-demo-pharmacy-6': 19 }, isDemo: true },
];
