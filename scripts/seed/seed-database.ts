import { getHospitalsCollection, getResourcesCollection, getHoldsCollection, initializeIndexes, getDb } from '@/lib/models';

/** Create a disposable demo network around the presenter instead of a fixed city. */
export async function seedDatabase(lat: number, lng: number) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error('Valid lat and lng are required.');
  await initializeIndexes();
  const [hospitals, resources, holds, db] = await Promise.all([getHospitalsCollection(), getResourcesCollection(), getHoldsCollection(), getDb()]);
  const demoDoctors = db.collection('doctors');
  await db.collection('pharmacies').deleteMany({ isDemo: true, seedBatch: 'location-demo' });
  const previous = await hospitals.find({ isDemo: true, seedBatch: 'location-demo' }).project({ _id: 1 }).toArray();
  const previousIds = previous.map((item) => item._id?.toString()).filter((id): id is string => Boolean(id));
  if (previousIds.length) {
    await Promise.all([
      hospitals.deleteMany({ _id: { $in: previous.map((item) => item._id) } }),
      resources.deleteMany({ hospitalId: { $in: previousIds } }),
      holds.deleteMany({ hospitalId: { $in: previousIds } }),
      demoDoctors.deleteMany({ hospitalId: { $in: previousIds } }),
    ]);
  }
  const now = new Date();
  const offsets = [[0.012, 0.006], [-0.018, 0.013], [0.009, -0.021]] as const;
  const inserted = await hospitals.insertMany(offsets.map(([dLat, dLng], index) => ({
    name: `CareLink Demo Hospital ${index + 1}`, code: `DEMO-LOC-${Date.now()}-${index + 1}`,
    isDemo: true, seedBatch: 'location-demo', address: { street: 'Demo location', city: 'Local area', state: '', zipCode: '', country: '' },
    location: { type: 'Point' as const, coordinates: [lng + dLng, lat + dLat] as [number, number] },
    contact: { phone: '', email: '', emergencyHotline: '' }, specialties: ['Emergency', 'General Medicine'],
    capacitySummary: { totalBeds: 60 + index * 10, availableBeds: 12 + index, totalVentilators: 5, availableVentilators: 2 },
    status: 'active' as const, createdAt: now, updatedAt: now,
  })));
  const ids = Object.values(inserted.insertedIds).map((id) => id.toString());
  await resources.insertMany(ids.map((hospitalId, index) => ({ hospitalId, type: 'bed' as const, category: index === 1 ? 'icu' : 'emergency', name: 'Demo beds', totalQuantity: 30, availableQuantity: 8 + index, heldQuantity: 0, status: 'available' as const, isDemo: true, createdAt: now, updatedAt: now })));
  await demoDoctors.insertMany(ids.map((hospitalId, index) => ({ hospitalId, name: `Demo Doctor ${index + 1}`, qualification: 'MD', specialization: index === 1 ? 'Cardiology' : 'Emergency Medicine', availability: 'available', createdAt: now, updatedAt: now })));
  const pharmacies = db.collection('pharmacies');
  const pharmacyDocs = offsets.slice(0, 2).map(([dLat, dLng], index) => ({ name: `CareLink Demo Pharmacy ${index + 1}`, isDemo: true, seedBatch: 'location-demo', location: { type: 'Point', coordinates: [lng - dLng, lat - dLat] }, address: { street: 'Demo location', city: 'Local area' }, createdAt: now, updatedAt: now }));
  await pharmacies.insertMany(pharmacyDocs);
  return { success: true, message: 'Demo facilities created around the submitted coordinates.', hospitalsInserted: ids.length, pharmaciesInserted: pharmacyDocs.length, doctorsInserted: ids.length, resourcesInserted: ids.length, holdsInserted: 0 };
}
