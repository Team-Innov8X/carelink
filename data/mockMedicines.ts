import { Medicine } from '../types';

export const INITIAL_MEDICINES: Medicine[] = [
  { id: 'med-1', name: 'Paracetamol 650mg', form: 'Tablets | 15 count', category: 'Analgesic', indication: 'For fever and pain relief', isEmergencyEssential: false, stock: { 'pharm-1': 120, 'pharm-2': 85 }, price: '₹35' },
  { id: 'med-2', name: 'Salbutamol Inhaler 100mcg', form: 'Metered dose inhaler | 200 doses', category: 'Respiratory', indication: 'For acute asthma symptoms', isEmergencyEssential: true, stock: { 'pharm-1': 22, 'pharm-2': 14 }, price: '₹160' },
  { id: 'med-3', name: 'Oral Rehydration Salts', form: 'Powder sachet | 1 litre', category: 'Hydration', indication: 'For fluid and electrolyte replacement', isEmergencyEssential: false, stock: { 'pharm-1': 75, 'pharm-2': 40, 'pharm-3': 28, 'pharm-4': 64 }, price: '₹22' },
  { id: 'med-4', name: 'Epinephrine 1mg/ml', form: 'Injection | 1 ampoule', category: 'Emergency', indication: 'Emergency stock item', isEmergencyEssential: true, stock: { 'pharm-1': 12, 'pharm-2': 4, 'pharm-3': 0, 'pharm-4': 18 }, price: '₹95' },
  { id: 'med-5', name: 'Amoxicillin 500mg', form: 'Capsules | 10 count', category: 'Antibiotic', indication: 'Prescription medicine', isEmergencyEssential: false, stock: { 'pharm-1': 50, 'pharm-2': 30, 'pharm-3': 15, 'pharm-4': 45 }, price: '₹115' },
  { id: 'med-6', name: 'Nitroglycerin 0.5mg', form: 'Sublingual tablets | 25 count', category: 'Cardiac', indication: 'Emergency stock item', isEmergencyEssential: true, stock: { 'pharm-1': 24, 'pharm-2': 10, 'pharm-3': 6, 'pharm-4': 30 }, price: '₹240' },
];
