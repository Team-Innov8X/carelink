import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

if (process.loadEnvFile) { try { process.loadEnvFile('.env'); } catch {} }

const { getHospitalsCollection, initializeIndexes } = await import('../lib/models/db.ts');
const { getNearbyFacilities, clearPlacesCache } = await import('../lib/places.ts');
const { default: clientPromise } = await import('../lib/mongodb.ts');

test('nearby hospital lookup includes a nearby facility and excludes it from a far city', { timeout: 30000 }, async () => {
  await initializeIndexes();
  const collection = await getHospitalsCollection();
  const id = `location-test-${randomUUID()}`;
  const point = { lat: 40.7128, lng: -74.006 };
  const originalFetch = globalThis.fetch;
  await collection.insertOne({ _id: id, id, name: 'Location test hospital', code: id, status: 'active', isDemo: false, address: { street: 'Test', city: 'Test', state: 'Test', zipCode: '00000', country: 'Test' }, contact: { phone: '', email: '', emergencyHotline: '' }, location: { type: 'Point', coordinates: [point.lng + 0.005, point.lat + 0.005] }, createdAt: new Date(), updatedAt: new Date() });
  try {
    process.env.GOOGLE_MAPS_API_KEY = '';
    globalThis.fetch = async () => Response.json({ elements: [] });
    clearPlacesCache();
    const nearby = await getNearbyFacilities({ ...point, radiusMeters: 5000 });
    assert.ok(nearby.registered.some((facility) => facility.id === id), 'nearby result should include the test hospital');
    clearPlacesCache();
    const far = await getNearbyFacilities({ lat: 34.0522, lng: -118.2437, radiusMeters: 5000 });
    assert.ok(!far.all.some((facility) => facility.id === id), 'far-away result should exclude the test hospital');
  } finally {
    globalThis.fetch = originalFetch;
    await collection.deleteOne({ _id: id });
    clearPlacesCache();
    await (await clientPromise).close();
  }
});
