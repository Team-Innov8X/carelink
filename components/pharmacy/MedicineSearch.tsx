import React, { useCallback, useEffect, useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import confetti from 'canvas-confetti';
import {
  Search,
  Pill,
  Store,
  Phone,
  ShoppingCart,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Check,
  PackageCheck,
  Plus,
  Minus,
} from '@/components/icons';

export const MedicineSearch: React.FC<{ mode?: 'patient' | 'pharmacy' }> = ({ mode = 'patient' }) => {
  const {
    medicines,
    pharmacies,
    updateMedicineStock,
    addMedicine,
    medicineOrders,
    setActiveTab,
  } = useCareLink();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMedicineId, setSelectedMedicineId] = useState<string>('');
  const [activeSubTab, setActiveSubTab] = useState<'search' | 'manage' | 'orders'>(mode === 'pharmacy' ? 'manage' : 'search');
  const [orderConfirmation, setOrderConfirmation] = useState<string | null>(null);
  const [newMedicineName, setNewMedicineName] = useState('');
  const [patientOrders, setPatientOrders] = useState<typeof medicineOrders>([]);
  const [ordersLoading, setOrdersLoading] = useState(mode === 'patient');
  const [orderError, setOrderError] = useState('');

  const loadPatientOrders = useCallback(async () => {
    if (mode !== 'patient') return;
    setOrdersLoading(true);
    setOrderError('');
    try {
      const response = await fetch('/api/pharmacy', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not load your medicine orders.');
      setPatientOrders(Array.isArray(payload.medicineOrders) ? payload.medicineOrders : []);
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : 'Could not load your medicine orders.');
    } finally { setOrdersLoading(false); }
  }, [mode]);

  useEffect(() => { void loadPatientOrders(); }, [loadPatientOrders]);

  const selectedMed =
    medicines.find((m) => m.id === selectedMedicineId) || medicines[0];
  const stockPharmacy = pharmacies[0];

  // Filter medicines by search query
  const filteredMedicines = medicines.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.indication.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOrder = async (pharmacyId: string) => {
    if (!selectedMed) return;
    const pharm = pharmacies.find((p) => p.id === pharmacyId);
    setOrderError('');
    try {
      const response = await fetch('/api/pharmacy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'order', medicineId: selectedMed.id, pharmacyId, quantity: 1, isUrgent: true }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not contact the pharmacy.');
      setPatientOrders((current) => [payload.order, ...current.filter((item) => item.id !== payload.order?.id)]);
      setOrderConfirmation(`Order ${payload.order.id} sent to ${pharm?.name || 'the pharmacy'}.`);
      window.dispatchEvent(new Event('carelink-data-refresh'));
      confetti({ particleCount: 60, spread: 55, origin: { y: 0.7 } });
      window.setTimeout(() => setOrderConfirmation(null), 4000);
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : 'Could not contact the pharmacy.');
    }
  };

  const handleRequestNearest = () => {
    if (!selectedMed) return;
    // Find nearest pharmacy with stock > 0
    const inStockPharmacies = pharmacies
      .filter((p) => (selectedMed.stock[p.id] || 0) > 0)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    if (inStockPharmacies.length > 0) {
      handleOrder(inStockPharmacies[0].id);
    } else {
      alert('All nearby pharmacies are currently out of stock for this formulation. A regional alert has been triggered.');
    }
  };

  if (!selectedMed) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No medicine records are available.</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header with Navigation */}
      <div className="flex items-center justify-between">
        {mode === 'patient' && <button
          onClick={() => setActiveTab('dashboard')}
          className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </button>}

        {/* Sub-tabs: Search, Pharmacy Portal, Active Orders */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl">
          {mode === 'patient' && <button
            onClick={() => setActiveSubTab('search')}
            className={`px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeSubTab === 'search'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Check Availability
          </button>}
          {mode === 'pharmacy' && <button
            onClick={() => setActiveSubTab('manage')}
            className={`px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeSubTab === 'manage'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Inventory
          </button>}
          <button
            onClick={() => { setActiveSubTab('orders'); void loadPatientOrders(); }}
            className={`px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeSubTab === 'orders'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Orders ({mode === 'patient' ? patientOrders.length : medicineOrders.length})
          </button>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {mode === 'pharmacy' ? 'Pharmacy Inventory' : 'Check Medicine Availability'}
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {mode === 'pharmacy' ? 'Update your live medicine stock and review incoming orders.' : 'Connect directly to certified local pharmacies to check live critical drug inventory.'}
        </p>
      </div>

      {/* Confirmation Toast */}
      {orderConfirmation && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{orderConfirmation}</span>
          </div>
          <span className="font-mono text-[11px] bg-white px-2 py-0.5 rounded border border-emerald-200">
            ETA: 15-20 min Delivery
          </span>
        </div>
      )}
      {orderError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{orderError}</p>}

      {/* Search Bar matching Mockup Screen 7 */}
      {activeSubTab === 'search' && (
        <>
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by medicine name, category, or indication"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-xs font-medium outline-none transition-all"
              />
            </div>

            <button
              onClick={() => {
                if (filteredMedicines.length > 0) {
                  setSelectedMedicineId(filteredMedicines[0].id);
                }
              }}
              className="w-full sm:w-auto px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-md shadow-sky-600/20 transition-all shrink-0"
            >
              Check Availability
            </button>
          </div>

          {/* Quick medicine pills / chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider shrink-0">
              Popular:
            </span>
            {medicines.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setSelectedMedicineId(m.id);
                  setSearchQuery(m.name.split(' ')[0]);
                }}
                className={`px-3 py-1 rounded-lg border text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedMedicineId === m.id
                    ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>

          {/* Requested Medicine Details Card (Mockup Panel 7) */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 border border-purple-200 flex items-center justify-center shrink-0 shadow-xs">
                <Pill className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Requested Medicine
                  </span>
                  {selectedMed.isEmergencyEssential && (
                    <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold">
                      Emergency Essential
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-black text-slate-900 mt-0.5">{selectedMed.name}</h3>
                <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-700">{selectedMed.form}</span>
                  <span>•</span>
                  <span>{selectedMed.indication}</span>
                  <span>•</span>
                  <span className="font-mono font-bold text-slate-900">{selectedMed.price}</span>
                </div>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-xs font-semibold text-slate-400 block">Total In Stock</span>
              <span className="text-2xl font-extrabold text-slate-900">
                {Object.values(selectedMed.stock).reduce((a, b) => a + b, 0)} Units
              </span>
            </div>
          </div>

          {/* Pharmacy Availability List (Mockup Panel 7) */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-900">Pharmacy Availability</h3>
                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Live Inventory
                </span>
              </div>
              <span className="text-xs text-slate-400">{pharmacies.length} nearby outlets</span>
            </div>

            <div className="space-y-3">
              {pharmacies.map((pharm) => {
                const stockQty = selectedMed.stock[pharm.id] || 0;
                const inStock = stockQty > 0;

                return (
                  <div
                    key={pharm.id}
                    className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      inStock
                        ? 'border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/20'
                        : 'border-slate-200 bg-slate-50/80 opacity-80'
                    }`}
                  >
                    {/* Left: Pharmacy Info */}
                    <div className="flex items-center gap-3.5">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                          inStock ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        <Store className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-slate-900">{pharm.name}</h4>
                          <span className="text-xs text-slate-400 font-medium">
                            • {pharm.distanceKm} km
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">{pharm.address}</p>
                      </div>
                    </div>

                    {/* Stock Status & Action Buttons matching mockup */}
                    <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      <div className="text-left sm:text-right">
                        {inStock ? (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                              <Check className="w-3 h-3 text-emerald-700" />
                              In Stock
                            </span>
                            <span className="text-xs font-bold font-mono text-slate-700">
                              Qty: {stockQty}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                              <AlertCircle className="w-3 h-3 text-rose-700" />
                              Out of Stock
                            </span>
                            <span className="text-xs font-bold font-mono text-slate-400">
                              Qty: 0
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <a href={`tel:${pharm.phone.replace(/[^+\d]/g, '')}`} className="px-3.5 py-2 bg-white hover:bg-slate-50 text-sky-800 font-bold text-xs rounded-xl border border-sky-200 transition-colors flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5" /><span>Call pharmacy</span>
                        </a>
                        {inStock ? <button type="button" onClick={() => void handleOrder(pharm.id)} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-xs transition-colors">Order</button> : <span className="text-xs text-slate-500">Call for availability</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Full-Width CTA matching mockup */}
            <div className="pt-3">
              <button
                onClick={handleRequestNearest}
                className="w-full py-3.5 bg-sky-600 hover:bg-sky-500 active:scale-98 text-white font-bold text-sm rounded-xl shadow-md shadow-sky-600/20 transition-all flex items-center justify-center gap-2"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Request from Nearest Available Pharmacy</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Sub-tab 2: Pharmacy Stock Portal (for Pharmacists) */}
      {activeSubTab === 'manage' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div>
            <h3 className="font-bold text-base text-slate-900">
              Pharmacy Inventory Live Adjustment
            </h3>
            <p className="text-xs text-slate-500">
              Update shelf counts in real-time so ambulance crews and hospital triage never route patients to pharmacies with stockouts.
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {medicines.map((med) => (
              <div key={med.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-sm text-slate-900">{med.name}</h4>
                  <div className="text-xs text-slate-500">{med.form} • {med.indication}</div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-500">{stockPharmacy?.name ?? 'No pharmacy'} Stock:</span>
                  {stockPharmacy && <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                    <button
                      onClick={() => updateMedicineStock(med.id, stockPharmacy.id, (med.stock[stockPharmacy.id] || 0) - 5)}
                      className="w-7 h-7 rounded-lg bg-white text-slate-700 font-bold flex items-center justify-center hover:bg-slate-100 border border-slate-200"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-mono font-bold text-sm w-8 text-center text-slate-900">
                      {med.stock[stockPharmacy.id] || 0}
                    </span>
                    <button
                      onClick={() => updateMedicineStock(med.id, stockPharmacy.id, (med.stock[stockPharmacy.id] || 0) + 5)}
                      className="w-7 h-7 rounded-lg bg-white text-slate-700 font-bold flex items-center justify-center hover:bg-slate-100 border border-slate-200"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>}
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); addMedicine(newMedicineName); setNewMedicineName(''); }} className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
            <input value={newMedicineName} onChange={(event) => setNewMedicineName(event.target.value)} placeholder="Medicine name not listed" aria-label="New medicine name" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
            <button type="submit" disabled={!newMedicineName.trim() || medicines.some((medicine) => medicine.name.toLowerCase() === newMedicineName.trim().toLowerCase())} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" />Add new medicine</button>
          </form>
        </div>
      )}

      {/* Sub-tab 3: Active Orders */}
      {activeSubTab === 'orders' && (
        <div className="bg-white rounded-2xl p-7 sm:p-8 border border-slate-200 shadow-xs space-y-5 text-sm">
          <h3 className="font-bold text-lg text-slate-900">{mode === 'patient' ? 'Your Medicine Orders' : 'Live Dispatched Medicine Orders'}</h3>

          {mode === 'patient' && ordersLoading ? <p role="status" className="py-8 text-center text-sm text-slate-500">Loading your orders…</p> : null}
          {mode === 'patient' && !ordersLoading && orderError ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p>{orderError}</p><button type="button" onClick={() => void loadPatientOrders()} className="font-semibold text-sky-800 underline">Retry loading orders</button></div> : null}
          {!(mode === 'patient' && (ordersLoading || orderError)) && (mode === 'patient' ? patientOrders : medicineOrders).length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              {mode === 'patient' ? 'You have no medicine orders yet.' : 'No active pharmacy orders yet.'}
            </div>
          ) : !(mode === 'patient' && (ordersLoading || orderError)) ? (
            <div className="space-y-3">
              {(mode === 'patient' ? patientOrders : medicineOrders).map((ord) => (
                <div
                  key={ord.id}
                  className="p-5 rounded-xl border border-slate-200 bg-slate-50/80 flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                      <PackageCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{ord.id}</span>
                        <span className="font-bold text-sky-700">{ord.medicineName}</span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          {ord.status}
                        </span>
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        Target: {ord.pharmacyName} • Requested by: {ord.requestedBy} • {ord.timestamp}
                      </div>
                      {mode === 'patient' && (() => { const phone = pharmacies.find((pharmacy) => pharmacy.id === ord.pharmacyId)?.phone; return phone ? <a href={`tel:${phone.replace(/[^+\d]/g, '')}`} className="mt-1 inline-flex items-center gap-1 font-semibold text-sky-800 hover:underline"><Phone className="h-3.5 w-3.5" />Call {ord.pharmacyName}</a> : <p className="mt-1 text-xs text-slate-500">Contact number unavailable</p>; })()}
                    </div>
                  </div>

                  <span className="font-mono font-bold text-slate-800 bg-white px-2.5 py-1 rounded border border-slate-200">
                    Qty: {ord.quantity}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
