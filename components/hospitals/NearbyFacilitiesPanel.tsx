'use client';

import { useCallback, useEffect, useState } from 'react';
import { MapView, type MapFacility } from '@/components/common/MapView';
import { DelayedSkeleton, HospitalListSkeleton } from '@/components/common/Skeletons';

type Point = { lat: number; lng: number };
type NearbyFacility = MapFacility & { distanceKm: number; phone?: string; isDemo?: boolean };

export function NearbyFacilitiesPanel() {
  const [point, setPoint] = useState<Point | null>(null);
  const [facilities, setFacilities] = useState<NearbyFacility[]>([]);
  const [city, setCity] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastKnown, setLastKnown] = useState<Point | null>(null);
  const [hospitals, setHospitals] = useState(true);
  const [pharmacies, setPharmacies] = useState(true);
  const [registeredOnly, setRegisteredOnly] = useState(false);
  const [requestingId, setRequestingId] = useState(''); const [requestMessage, setRequestMessage] = useState('');

  const search = useCallback(async (coords: Point) => {
    setPoint(coords); setLoading(true); setError('');
    try {
      const response = await fetch(`/api/nearby-facilities?lat=${coords.lat}&lng=${coords.lng}&radius=25000`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Nearby facilities are unavailable.');
      setFacilities(Array.isArray(result.facilities) ? result.facilities : []);
      try { localStorage.setItem('carelink_last_location', JSON.stringify(coords)); } catch { /* optional local preference */ }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Nearby facilities are unavailable.'); }
    finally { setLoading(false); }
  }, []);

  const locate = useCallback(() => {
    setError('');
    setLoading(true);
    if (!navigator.geolocation) { setError('Location is unavailable. Search by city or try again.'); setLoading(false); return; }
    navigator.geolocation.getCurrentPosition(({ coords }) => { const value = { lat: coords.latitude, lng: coords.longitude }; setLastKnown(value); void search(value); }, (cause) => {
      setError(cause.code === cause.PERMISSION_DENIED ? 'Location access was denied. Search by city or try again.' : 'Could not get your location. Search by city or try again.');
      setLoading(false);
      try { const stored = localStorage.getItem('carelink_last_location'); if (stored) setLastKnown(JSON.parse(stored) as Point); } catch { /* ignore stale preference */ }
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  }, [search]);

  useEffect(() => { locate(); }, [locate]);

  const searchCity = async (event: React.FormEvent) => {
    event.preventDefault(); if (!city.trim()) return;
    setLoading(true); setError('');
    try {
      const externalStartedAt = performance.now();
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(city.trim())}`, { headers: { Accept: 'application/json' } });
      if (process.env.NEXT_PUBLIC_CARELINK_PERF_LOGS === '1') console.info(JSON.stringify({ event: 'carelink.perf', name: 'nominatim_geocode', durationMs: Math.round((performance.now() - externalStartedAt) * 100) / 100, status: response.status }));
      if (!response.ok) throw new Error('Could not search that location. Try again.');
      const [result] = await response.json() as { lat: string; lon: string }[];
      if (!result) throw new Error('No matching location found.');
      await search({ lat: Number(result.lat), lng: Number(result.lon) });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not search that location.'); setLoading(false); }
  };

  const visible = facilities.filter((item) => (item.type === 'pharmacy' ? pharmacies : hospitals) && (!registeredOnly || item.registered));
  const requestBed = async (facility: NearbyFacility) => {
    setRequestingId(facility.id); setRequestMessage('');
    try { const response = await fetch('/api/holds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hospitalId: facility.id }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Bed request could not be submitted.'); setRequestMessage(result.status === 'queued' ? `You are in queue at ${facility.name}.` : `Bed request sent to ${facility.name}.`); }
    catch (cause) { setRequestMessage(cause instanceof Error ? cause.message : 'Bed request could not be submitted.'); }
    finally { setRequestingId(''); }
  };
  return <section className="rounded-2xl border border-slate-200 bg-sky-50 p-4 sm:p-5" aria-label="Nearby facilities">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Facilities near you</h2><p className="text-sm text-slate-600">Distance sorted · OpenStreetMap data</p></div><button type="button" onClick={locate} className="rounded-lg border border-sky-800 px-3 py-2 text-sm font-semibold text-sky-900">Update my location</button></div>
    {!point && lastKnown && <p className="mt-2 text-sm text-slate-700">Last known location · {lastKnown.lat.toFixed(4)}, {lastKnown.lng.toFixed(4)}</p>}
    <form onSubmit={searchCity} className="mt-3 flex gap-2"><label htmlFor="nearby-city" className="sr-only">Search by city or address</label><input id="nearby-city" value={city} onChange={(event) => setCity(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm" placeholder="Search by city or address"/><button disabled={loading || !city.trim()} className="rounded-lg bg-sky-800 px-4 text-sm font-semibold text-white disabled:opacity-50">Search</button></form>
    <div className="mt-3 flex flex-wrap gap-4 text-sm"><label><input type="checkbox" checked={hospitals} onChange={(event) => setHospitals(event.target.checked)} /> Hospitals</label><label><input type="checkbox" checked={pharmacies} onChange={(event) => setPharmacies(event.target.checked)} /> Pharmacies</label><label><input type="checkbox" checked={registeredOnly} onChange={(event) => setRegisteredOnly(event.target.checked)} /> Registered only</label></div>
    {error && <p role="alert" className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-800">{error}</p>}
    {requestMessage && <p role="status" className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-800">{requestMessage}</p>}
    {loading && <div className="mt-4"><DelayedSkeleton><HospitalListSkeleton /></DelayedSkeleton></div>}
    {point && <div className="mt-4"><MapView center={[point.lat, point.lng]} facilities={visible} height="300px" showNetworkMarkers={false} /></div>}
    {point && !loading && visible.length === 0 && <p className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-800">No nearby facilities found. Try another location or a wider search.</p>}
    <ul className="mt-3 grid gap-2 sm:grid-cols-2">{visible.map((item) => <li key={item.id} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex justify-between gap-2"><h3 className="font-semibold text-slate-900">{item.name}</h3><span className="text-xs font-semibold text-slate-700">{item.distanceKm.toFixed(1)} km</span></div><p className="mt-1 text-sm text-slate-700">{item.type === 'pharmacy' ? 'Pharmacy' : 'Hospital'} · {item.isDemo ? 'Demo' : item.registered ? 'Registered' : 'Unregistered · availability unknown'}</p>{item.location.address && <p className="mt-1 text-sm text-slate-600">{item.location.address}</p>}<div className="mt-2 flex flex-wrap gap-3 text-sm"><a className="font-semibold text-sky-800 underline" href={`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${point?.lat}%2C${point?.lng}%3B${item.location.lat}%2C${item.location.lng}`} target="_blank" rel="noreferrer">Get directions</a>{item.phone && <a href={`tel:${item.phone}`} className="font-semibold text-sky-800 underline">Call</a>}{item.registered && item.type === 'hospital' && <button type="button" disabled={Boolean(requestingId)} onClick={() => void requestBed(item)} className="rounded-md bg-sky-800 px-3 py-1 font-semibold text-white disabled:opacity-50">{requestingId === item.id ? 'Sending…' : 'Request bed'}</button>}</div></li>)}</ul>
    <p className="mt-3 text-xs text-slate-600">Map and facility data © OpenStreetMap contributors.</p>
  </section>;
}
