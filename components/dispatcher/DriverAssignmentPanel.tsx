'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ambulance, Clock3, MapPin, RefreshCw, Send } from '@/components/icons';

type DispatchDriver = { id: string; name: string; ambulanceId: string; ambulanceType: string; crew: string; status: string; distanceKm: number | null; estimatedEtaMinutes: number | null };
type DispatchRequest = { id: string; patientName: string; patientPhone?: string; incidentType: string; requiredEquipment: string[]; location: { latitude: number; longitude: number }; createdAt: string; assignedDriverId?: string; assignmentExpiresAt?: string };

export function DriverAssignmentPanel() {
  const [requests, setRequests] = useState<DispatchRequest[]>([]);
  const [drivers, setDrivers] = useState<DispatchDriver[]>([]);
  const [requestId, setRequestId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [maxDistance, setMaxDistance] = useState('50');
  const activeRequest = requests.find((item) => item.id === requestId);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/dispatcher/drivers?latitude=28.6328&longitude=77.2195', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load available drivers.');
      setRequests(result.requests ?? []);
      setDrivers(result.drivers ?? []);
      setRequestId((current) => result.requests?.some((item: DispatchRequest) => item.id === current) ? current : result.requests?.[0]?.id ?? '');
      setDriverId((current) => result.drivers?.some((item: DispatchDriver) => item.id === current && item.status === 'Available') ? current : result.drivers?.find((item: DispatchDriver) => item.status === 'Available')?.id ?? '');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load available drivers.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const firstLoad = window.setTimeout(() => void refresh(), 0); const timer = window.setInterval(() => void refresh(), 5000); return () => { window.clearTimeout(firstLoad); window.clearInterval(timer); }; }, [refresh]);
  const recommended = useMemo(() => drivers.find((driver) => driver.status === 'Available' && (!activeRequest?.requiredEquipment?.length || activeRequest.requiredEquipment.every((requirement) => !/ventilator|advanced|als/i.test(requirement)) || /advanced|als/i.test(driver.ambulanceType))), [activeRequest, drivers]);
  const filteredDrivers = useMemo(() => drivers.filter((driver) => (availabilityFilter === 'all' || driver.status === availabilityFilter) && (typeFilter === 'all' || (typeFilter === 'advanced' ? /advanced|als/i.test(driver.ambulanceType) : !/advanced|als/i.test(driver.ambulanceType))) && (driver.distanceKm === null || driver.distanceKm <= Number(maxDistance))), [availabilityFilter, drivers, maxDistance, typeFilter]);
  const sendOffer = async (selectedDriverId = driverId) => {
    if (!activeRequest || !selectedDriverId) return;
    setMessage('');
    try {
      const response = await fetch('/api/dispatcher/drivers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: activeRequest.id, driverId: selectedDriverId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not offer this request.');
      setMessage('Offer sent. The driver has 15 seconds to respond.'); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not offer this request.'); await refresh(); }
  };

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-slate-900">Driver assignment</h2><p className="mt-1 text-xs text-slate-500">Offer a live SOS to a nearby driver. It returns to the queue if they do not respond within 15 seconds.</p></div><button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"><RefreshCw className="h-3.5 w-3.5" />Refresh</button></div>
    {message && <p role="status" className="mt-3 rounded-lg bg-sky-50 p-3 text-xs text-sky-900">{message}</p>}
    {requests.length === 0 ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No live SOS requests are waiting for a driver. {loading ? 'Refreshing…' : ''}</p> : <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]"><div><label htmlFor="dispatch-request" className="mb-1 block text-xs font-bold text-slate-700">Open emergency</label><select id="dispatch-request" value={requestId} onChange={(event) => setRequestId(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">{requests.map((item) => <option key={item.id} value={item.id}>{item.patientName} · {item.incidentType} · {item.id}</option>)}</select>{activeRequest && <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 p-3"><p className="font-bold text-rose-950">{activeRequest.patientName} · {activeRequest.incidentType}</p><p className="mt-1 flex items-center gap-1 text-xs text-rose-900"><MapPin className="h-3 w-3" />Pickup {activeRequest.location.latitude.toFixed(4)}, {activeRequest.location.longitude.toFixed(4)}</p><p className="mt-1 text-xs text-slate-600">Needs: {activeRequest.requiredEquipment?.join(', ') || 'No special equipment specified'}</p>{activeRequest.assignedDriverId && <p className="mt-2 flex items-center gap-1 text-xs font-bold text-amber-800"><Clock3 className="h-3 w-3" />Offer expires {activeRequest.assignmentExpiresAt ? new Date(activeRequest.assignmentExpiresAt).toLocaleTimeString() : 'soon'}</p>}</div>}</div>
    <div><div className="mb-2 grid gap-2 sm:grid-cols-3"><select aria-label="Filter driver availability" value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-xs"><option value="all">Any availability</option><option>Available</option><option>Busy</option><option>Offline</option></select><select aria-label="Filter ambulance type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-xs"><option value="all">Any ambulance</option><option value="basic">Basic life support</option><option value="advanced">Advanced life support</option></select><select aria-label="Filter driver distance" value={maxDistance} onChange={(event) => setMaxDistance(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-xs"><option value="5">Within 5 km</option><option value="10">Within 10 km</option><option value="25">Within 25 km</option><option value="50">Within 50 km</option></select></div><div className="space-y-2">{filteredDrivers.slice(0, 10).map((driver) => <button key={driver.id} type="button" disabled={driver.status !== 'Available'} onClick={() => setDriverId(driver.id)} className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left disabled:cursor-not-allowed disabled:opacity-50 ${driverId === driver.id ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white'}`}><span className="flex min-w-0 items-center gap-3"><span className={`rounded-lg p-2 ${driver.status === 'Available' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}><Ambulance className="h-4 w-4" /></span><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-900">{driver.name} · {driver.ambulanceId}{driver.id === recommended?.id && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-800">Recommended</span>}</span><span className="mt-0.5 block text-xs text-slate-500">{driver.ambulanceType} · {driver.crew} · {driver.distanceKm === null ? 'Location unavailable' : `${driver.distanceKm} km · ETA ${driver.estimatedEtaMinutes} min`}</span></span><span className={`shrink-0 text-[11px] font-bold ${driver.status === 'Available' ? 'text-emerald-700' : 'text-slate-500'}`}>{driver.status}{driver.status === 'Busy' ? ' · active trip/offer' : driver.status === 'Offline' ? ' · not on duty' : ''}</span></span></button>)}</div><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={!activeRequest || !driverId || Boolean(activeRequest.assignedDriverId)} onClick={() => void sendOffer()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" />Assign selected</button><button type="button" disabled={!recommended || !activeRequest || Boolean(activeRequest.assignedDriverId)} onClick={() => recommended && void sendOffer(recommended.id)} className="min-h-10 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 disabled:opacity-50">Auto-assign nearest</button></div></div></div>}
    {drivers.length === 0 && requests.length > 0 && <p className="mt-3 text-sm text-slate-500">No currently available live drivers. Busy or offline drivers are excluded from assignment.</p>}
  </section>;
}
