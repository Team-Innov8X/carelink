import { getHospitalsCollection, getResourcesCollection, getHoldsCollection, initializeIndexes } from '@/lib/models';

export async function seedDatabase() {
  await initializeIndexes();
  const [hospitals, resources, holds] = await Promise.all([getHospitalsCollection(), getResourcesCollection(), getHoldsCollection()]);
  const previous = await hospitals.find({ isDemo: true }).project({ _id: 1 }).toArray();
  const previousIds = previous.map(item => item._id?.toString()).filter((id): id is string => Boolean(id));
  await hospitals.deleteMany({ isDemo: true });
  if (previousIds.length) {
    await Promise.all([resources.deleteMany({ hospitalId: { $in: previousIds } }), holds.deleteMany({ hospitalId: { $in: previousIds } })]);
  }
  const now = new Date();
  const sampleHospitals = [
    { name: 'CareLink demo hospital – Pune', code: 'DEMO-PUNE-01', isDemo: true, address: { street: 'Central Pune', city: 'Pune', state: 'Maharashtra', zipCode: '411001', country: 'India' }, location: { type: 'Point' as const, coordinates: [73.8567, 18.5204] as [number, number] }, contact: { phone: '', email: '', emergencyHotline: '' }, capacitySummary: { totalBeds: 80, availableBeds: 16, totalVentilators: 8, availableVentilators: 2 }, status: 'active' as const, createdAt: now, updatedAt: now },
    { name: 'CareLink demo hospital – Pimpri-Chinchwad', code: 'DEMO-PCMC-01', isDemo: true, address: { street: 'Pimpri', city: 'Pimpri-Chinchwad', state: 'Maharashtra', zipCode: '411018', country: 'India' }, location: { type: 'Point' as const, coordinates: [73.8050, 18.6298] as [number, number] }, contact: { phone: '', email: '', emergencyHotline: '' }, capacitySummary: { totalBeds: 60, availableBeds: 10, totalVentilators: 6, availableVentilators: 1 }, status: 'busy' as const, createdAt: now, updatedAt: now },
    { name: 'CareLink demo hospital – Mumbai', code: 'DEMO-MUM-01', isDemo: true, address: { street: 'Bandra', city: 'Mumbai', state: 'Maharashtra', zipCode: '400050', country: 'India' }, location: { type: 'Point' as const, coordinates: [72.8362, 19.0596] as [number, number] }, contact: { phone: '', email: '', emergencyHotline: '' }, capacitySummary: { totalBeds: 110, availableBeds: 22, totalVentilators: 10, availableVentilators: 3 }, status: 'active' as const, createdAt: now, updatedAt: now },
    { name: 'CareLink demo hospital – Delhi', code: 'DEMO-DEL-01', isDemo: true, address: { street: 'Central Delhi', city: 'New Delhi', state: 'Delhi', zipCode: '110001', country: 'India' }, location: { type: 'Point' as const, coordinates: [77.2090, 28.6139] as [number, number] }, contact: { phone: '', email: '', emergencyHotline: '' }, capacitySummary: { totalBeds: 90, availableBeds: 12, totalVentilators: 8, availableVentilators: 2 }, status: 'active' as const, createdAt: now, updatedAt: now },
  ];
  const inserted = await hospitals.insertMany(sampleHospitals);
  const ids = [inserted.insertedIds[0].toString(), inserted.insertedIds[1].toString()];
  const sampleResources = [
    { hospitalId: ids[0], type: 'bed' as const, category: 'icu', name: 'Demo ICU beds', totalQuantity: 15, availableQuantity: 3, heldQuantity: 0, status: 'available' as const, isDemo: true, createdAt: now, updatedAt: now },
    { hospitalId: ids[0], type: 'equipment' as const, category: 'ventilator', name: 'Demo ventilators', totalQuantity: 10, availableQuantity: 2, heldQuantity: 0, status: 'available' as const, isDemo: true, createdAt: now, updatedAt: now },
    { hospitalId: ids[1], type: 'bed' as const, category: 'emergency', name: 'Demo emergency beds', totalQuantity: 25, availableQuantity: 5, heldQuantity: 0, status: 'available' as const, isDemo: true, createdAt: now, updatedAt: now },
  ];
  await resources.insertMany(sampleResources);
  return { success: true, message: 'Demo facilities seeded across Pune, Pimpri-Chinchwad, Mumbai, and Delhi.', hospitalsInserted: sampleHospitals.length, resourcesInserted: sampleResources.length, holdsInserted: 0 };
}
