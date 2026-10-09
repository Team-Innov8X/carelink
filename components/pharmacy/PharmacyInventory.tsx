'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardList, PackagePlus, Pill, RefreshCw, Search } from '@/components/icons';
import { Medicine, MedicineOrder, Pharmacy } from '@/types';

type PharmacyMedicine = Medicine & { minimumStock?: number; updatedAt?: string };
type PharmacyOrder = Omit<MedicineOrder, 'status'> & { status: string; caseId?: string; patientId?: string; ambulanceId?: string; reserved?: boolean; rejectionReason?: string };
type ApiState = { medicines: PharmacyMedicine[]; medicineOrders: PharmacyOrder[]; pharmacies: Pharmacy[]; pharmacyId: string; updatedAt: string };
type ChangeLog = { _id: string; medicineName: string; oldQuantity: number; newQuantity: number; actorName: string; createdAt: string };

const statusFor = (quantity: number, minimum: number) => quantity <= 0 ? 'Out of stock' : quantity <= minimum ? 'Low' : 'In stock';

export function PharmacyInventory() {
  const [state, setState] = useState<ApiState | null>(null);
  const [logs, setLogs] = useState<ChangeLog[]>([]);
  const [tab, setTab] = useState<'inventory' | 'orders'>('inventory');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [lowestFirst, setLowestFirst] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState('');
  const [clockNow, setClockNow] = useState(0);
  const [newName, setNewName] = useState('');
  const [newMinimum, setNewMinimum] = useState('5');

  const refresh = useCallback(async () => {
    const [response, logResponse] = await Promise.all([fetch('/api/pharmacy', { cache: 'no-store' }), fetch('/api/pharmacy/activity', { cache: 'no-store' })]);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load inventory.');
    setState(data);
    setUpdatedAt(data.updatedAt);
    if (logResponse.ok) setLogs((await logResponse.json()).logs ?? []);
  }, []);

  useEffect(() => { const firstLoad = window.setTimeout(() => { setClockNow(Date.now()); void refresh().catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Could not load inventory.')); }, 0); const timer = window.setInterval(() => { setClockNow(Date.now()); void refresh().catch(() => undefined); }, 15000); return () => { window.clearTimeout(firstLoad); window.clearInterval(timer); }; }, [refresh]);

  const pharmacy = state?.pharmacies.find((item) => item.id === state.pharmacyId);
  const runAction = async (key: string, body: Record<string, unknown>) => {
    setBusy(key); setMessage('');
    try {
      const response = await fetch('/api/pharmacy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save change.');
      if (state) setState({ ...state, medicines: result.medicines ?? state.medicines, medicineOrders: result.medicineOrders ?? state.medicineOrders });
      if (body.action === 'stock') setQuantities((current) => { const next = { ...current }; delete next[String(body.medicineId)]; return next; });
      setUpdatedAt(new Date().toISOString()); setMessage(result.order ? `Order ${result.order.id} received and stock reserved.` : 'Inventory updated and saved.');
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save change.'); }
    finally { setBusy(null); }
  };

  const visibleMedicines = useMemo(() => {
    const entries = (state?.medicines ?? []).filter((item) => `${item.name} ${item.category} ${item.indication}`.toLowerCase().includes(query.toLowerCase())).filter((item) => category === 'all' || (category === 'emergency' ? item.isEmergencyEssential : category === 'prescription' ? /prescription|antibiotic/i.test(`${item.category} ${item.indication}`) : !item.isEmergencyEssential && !/prescription|antibiotic/i.test(`${item.category} ${item.indication}`)));
    return entries.sort((a, b) => Number(b.isEmergencyEssential) - Number(a.isEmergencyEssential) || (lowestFirst ? (a.stock[state?.pharmacyId ?? ''] ?? 0) - (b.stock[state?.pharmacyId ?? ''] ?? 0) : a.name.localeCompare(b.name)));
  }, [state, query, category, lowestFirst]);
  const emergencyItems = visibleMedicines.filter((item) => item.isEmergencyEssential);
  const regularItems = visibleMedicines.filter((item) => !item.isEmergencyEssential);
  const ageMinutes = updatedAt && clockNow ? Math.max(0, Math.floor((clockNow - new Date(updatedAt).getTime()) / 60000)) : 0;
  const staleTone = ageMinutes >= 60 ? 'border-rose-200 bg-rose-50 text-rose-800' : ageMinutes >= 15 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800';

  const addMedicine = async (event: FormEvent) => { event.preventDefault(); if (!newName.trim()) return; await runAction('add', { action: 'add', name: newName.trim(), minimum: Number(newMinimum) }); setNewName(''); };
  const saveQuantity = (medicine: PharmacyMedicine, value: string) => {
    const qty = Number(value);
    if (!Number.isSafeInteger(qty) || qty < 0) { setMessage('Stock must be a whole number of zero or more.'); return; }
    void runAction(medicine.id, { action: 'stock', medicineId: medicine.id, quantity: qty });
  };
  const orderStatus = (order: PharmacyOrder) => {
    if (order.status === 'New') return <div className="flex gap-2"><button onClick={() => void runAction(order.id, { action: 'order-status', orderId: order.id, status: 'Confirmed' })} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Confirm</button><button onClick={() => { const reason = window.prompt('Reason for rejecting this order:'); if (reason?.trim()) void runAction(order.id, { action: 'order-status', orderId: order.id, status: 'Rejected', reason: reason.trim() }); }} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700">Reject</button></div>;
    const next: Record<string, string> = { Confirmed: 'Packed', Packed: 'Picked up', 'Picked up': 'Delivered' };
    return next[order.status] ? <button onClick={() => void runAction(order.id, { action: 'order-status', orderId: order.id, status: next[order.status] })} className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white">Mark {next[order.status]}</button> : null;
  };

  if (!state) return <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading pharmacy workspace…{message && <p role="alert" className="mt-3 text-rose-700">{message}</p>}</section>;

  const renderRows = (items: PharmacyMedicine[]) => <div className="divide-y divide-slate-100">{items.map((medicine) => {
    const stock = medicine.stock[state.pharmacyId] ?? 0;
    const minimum = medicine.minimumStock ?? (medicine.isEmergencyEssential ? 8 : 10);
    const status = statusFor(stock, minimum);
    const reserved = state.medicineOrders.filter((order) => order.medicineId === medicine.id && order.pharmacyId === state.pharmacyId && ['New', 'Confirmed', 'Packed', 'Picked up'].includes(order.status)).reduce((sum, order) => sum + order.quantity, 0);
    const itemAge = medicine.updatedAt && clockNow ? Math.max(0, Math.floor((clockNow - new Date(medicine.updatedAt).getTime()) / 60000)) : ageMinutes;
    return <article key={medicine.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-900">{medicine.name}</h3><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${status === 'In stock' ? 'bg-emerald-100 text-emerald-800' : status === 'Low' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>{status}</span>{medicine.isEmergencyEssential && <span className="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-bold text-rose-800">Emergency stock</span>}</div><p className="mt-1 text-xs text-slate-500">{medicine.form} · {medicine.indication}</p><p className="mt-1 text-xs text-slate-500">{stock} strips available · {reserved} reserved · minimum {minimum} strips · updated {itemAge < 1 ? 'just now' : `${itemAge} min ago`}</p></div><div className="flex items-center gap-2"><button aria-label={`Decrease ${medicine.name} stock by one`} onClick={() => saveQuantity(medicine, String(Math.max(0, stock - 1)))} className="h-10 w-10 rounded-lg border border-slate-200 text-lg">−</button><label className="sr-only" htmlFor={`stock-${medicine.id}`}>Stock quantity in strips for {medicine.name}</label><input id={`stock-${medicine.id}`} type="number" min="0" step="1" value={quantities[medicine.id] ?? stock} onChange={(event) => setQuantities((old) => ({ ...old, [medicine.id]: event.target.value }))} onBlur={() => { const value = quantities[medicine.id]; if (value !== undefined && Number(value) !== stock) saveQuantity(medicine, value); }} className="w-24 rounded-lg border border-slate-200 px-2 py-2 text-center text-sm font-bold" /><span className="text-xs text-slate-500">strips</span><button aria-label={`Increase ${medicine.name} stock by one`} onClick={() => saveQuantity(medicine, String(stock + 1))} className="h-10 w-10 rounded-lg border border-slate-200 text-lg">+</button></div><label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={stock === 0} onChange={(event) => saveQuantity(medicine, event.target.checked ? '0' : String(Math.max(1, minimum + 1)))} />Out of stock</label></article>;
  })}</div>;

  return <section className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-black text-slate-950">Pharmacy Inventory</h1><p className="mt-1 text-sm text-slate-600">{pharmacy?.name ?? 'CareLink pharmacy'} · Inventory and incoming medicine requests</p></div><button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"><RefreshCw className="h-4 w-4" />Refresh</button></header>
    <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm ${staleTone}`}><span className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />Last updated {ageMinutes < 1 ? 'just now' : `${ageMinutes} min ago`}</span><span>Stock quantities are shared with patient and dispatcher availability views.</span></div>
    {message && <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">{message}</p>}
    <nav className="flex gap-2" aria-label="Pharmacy sections"><button onClick={() => setTab('inventory')} className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === 'inventory' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}><Pill className="mr-2 inline h-4 w-4" />Inventory</button><button onClick={() => setTab('orders')} className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === 'orders' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}><ClipboardList className="mr-2 inline h-4 w-4" />Orders ({state.medicineOrders.filter((order) => order.pharmacyId === state.pharmacyId && !['Delivered', 'Rejected', 'Cancelled'].includes(order.status)).length})</button></nav>
    {tab === 'inventory' ? <><section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="grid gap-3 md:grid-cols-[1fr_200px_auto]"><label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search inventory" className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm" /></label><select aria-label="Filter medicine category" value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="all">All categories</option><option value="emergency">Emergency</option><option value="prescription">Prescription</option><option value="otc">OTC</option></select><button onClick={() => setLowestFirst((value) => !value)} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${lowestFirst ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white'}`}>Sort: {lowestFirst ? 'Lowest stock' : 'Name'}</button></div></section>
    {emergencyItems.length > 0 && <section className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5"><h2 className="flex items-center gap-2 font-bold text-rose-900"><AlertTriangle className="h-5 w-5" />Emergency stock</h2>{renderRows(emergencyItems)}</section>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold text-slate-900">Other medicines</h2>{regularItems.length ? renderRows(regularItems) : <p className="py-5 text-sm text-slate-500">No matching medicines.</p>}</section>
    <form onSubmit={(event) => void addMedicine(event)} className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-5"><div className="min-w-[240px] flex-1"><label className="mb-1 block text-xs font-bold text-slate-700" htmlFor="new-medicine">Add medicine</label><input id="new-medicine" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Medicine name" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></div><div><label className="mb-1 block text-xs font-bold text-slate-700" htmlFor="minimum-stock">Low stock alert at</label><input id="minimum-stock" type="number" min="0" value={newMinimum} onChange={(event) => setNewMinimum(event.target.value)} className="w-28 rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></div><button disabled={!newName.trim() || busy === 'add'} className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><PackagePlus className="h-4 w-4" />Add medicine</button></form>
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold">Recent stock changes</h2>{logs.length ? <ul className="mt-3 divide-y divide-slate-100">{logs.slice(0, 8).map((log) => <li key={log._id} className="flex flex-wrap justify-between gap-2 py-2 text-xs text-slate-600"><span><b className="text-slate-900">{log.medicineName}</b> · {log.oldQuantity} → {log.newQuantity} strips · {log.actorName}</span><time>{new Date(log.createdAt).toLocaleString()}</time></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">Stock changes will appear here.</p>}</section></> : <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold">Incoming orders</h2>{state.medicineOrders.filter((order) => order.pharmacyId === state.pharmacyId).length ? <div className="mt-3 space-y-3">{state.medicineOrders.filter((order) => order.pharmacyId === state.pharmacyId).map((order) => <article key={order.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 p-4"><div><div className="flex flex-wrap items-center gap-2"><b>{order.medicineName}</b><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${order.isUrgent ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>{order.isUrgent ? 'Emergency' : 'Standard'} · {order.status}</span></div><p className="mt-1 text-xs text-slate-600">{order.id} · {order.quantity} strips · {order.caseId ? `Case ${order.caseId}` : `Requested by ${order.requestedBy}`}{order.ambulanceId ? ` · ${order.ambulanceId}` : ''}</p><p className="mt-1 text-xs text-slate-500">{new Date(order.timestamp).toLocaleString()}{order.rejectionReason ? ` · ${order.rejectionReason}` : ''}</p></div>{orderStatus(order)}</article>)}</div> : <p className="py-10 text-center text-sm text-slate-500">No pharmacy orders yet.</p>}</section>}
  </section>;
}
