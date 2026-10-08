'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Clock, RefreshCw, X, Users } from 'lucide-react';
import { useCareLink } from '../../context/CareLinkContext';

type BedHold = {
  _id: string;
  id?: string;
  patientId?: string;
  requestedByUserId?: string;
  hospitalId: string;
  status: 'pending' | 'queued' | 'confirmed' | 'rejected' | 'expired' | 'cancelled';
  seq?: number;
  queuePosition?: number;
  expiresAt?: string;
  createdAt: string;
  secondsRemaining?: number;
  notes?: string;
};

export function HospitalRequestInbox({ hospitalId, searchQuery = '' }: { hospitalId?: string; searchQuery?: string }) {
  const { hospitals } = useCareLink();
  const effectiveHospitalId = hospitalId || hospitals[0]?.id;

  const [holds, setHolds] = useState<BedHold[]>([]);
  const [queueLength, setQueueLength] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState<number>(Date.now());

  // Second tick for countdown
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const refresh = useCallback(async () => {
    if (!effectiveHospitalId) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/hospitals/${encodeURIComponent(effectiveHospitalId)}/holds`, { cache: 'no-store' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not load hospital holds');
      }
      const data = await res.json();
      setHolds(data.holds ?? []);
      setQueueLength(data.queueLength ?? 0);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load hospital holds.');
    } finally {
      setLoading(false);
    }
  }, [effectiveHospitalId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const confirmHold = async (holdId: string) => {
    setBusyId(holdId);
    setMessage('');
    try {
      const res = await fetch(`/api/holds/${encodeURIComponent(holdId)}/confirm`, {
        method: 'PATCH',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to confirm hold');
      setMessage('Bed hold confirmed! Reserved bed committed for the patient.');
      await refresh();
      window.dispatchEvent(new Event('carelink-data-refresh'));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not confirm hold.');
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const rejectHold = async (holdId: string) => {
    setBusyId(holdId);
    setMessage('');
    try {
      const res = await fetch(`/api/holds/${encodeURIComponent(holdId)}/reject`, {
        method: 'PATCH',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reject hold');
      setMessage('Hold rejected. Next queued patient automatically promoted.');
      await refresh();
      window.dispatchEvent(new Event('carelink-data-refresh'));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not reject hold.');
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const query = searchQuery.trim().toLowerCase();
  const visibleHolds = holds.filter((h) => {
    if (!query) return true;
    const holdId = h.id || h._id;
    return (
      holdId.toLowerCase().includes(query) ||
      (h.patientId && h.patientId.toLowerCase().includes(query)) ||
      (h.notes && h.notes.toLowerCase().includes(query))
    );
  });

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-slate-900">Bed Reservation Inbox</h2>
            {queueLength > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-200">
                <Users className="h-3 w-3" />
                Queue: {queueLength} waiting
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Pending bed requests require confirmation before the hold window expires (90 seconds).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          aria-label="Refresh patient requests"
          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 transition"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {message && (
        <p role="status" className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900 border border-sky-100">
          {message}
        </p>
      )}

      {loading ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Loading incoming bed requests…</p>
      ) : visibleHolds.length === 0 ? (
        <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
          {query ? 'No bed requests match your search.' : 'No pending bed requests waiting for confirmation.'}
          {queueLength > 0 && (
            <p className="mt-1 font-semibold text-amber-700">
              {queueLength} patient{queueLength === 1 ? ' is' : 's are'} currently queued for next available beds.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleHolds.map((hold) => {
            const holdId = hold.id || hold._id;
            const expiresAtMs = hold.expiresAt ? new Date(hold.expiresAt).getTime() : 0;
            const secondsLeft = Math.max(0, Math.floor((expiresAtMs - now) / 1000));
            const isUrgent = secondsLeft < 30;

            return (
              <article
                key={holdId}
                className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 shadow-2xs transition"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">
                        Patient Bed Request #{holdId.slice(0, 8)}
                      </span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800 border border-amber-200">
                        Pending Confirmation
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-slate-600">
                      Patient Ref: <span className="font-mono">{hold.patientId?.slice(0, 10) || 'Unknown'}</span>
                      {hold.seq !== undefined && <span> · Queue Seq #{hold.seq}</span>}
                    </p>

                    {hold.notes && (
                      <p className="mt-1 text-xs text-slate-500 italic">“{hold.notes}”</p>
                    )}
                  </div>

                  {/* Countdown pill */}
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                        isUrgent
                          ? 'bg-rose-100 text-rose-800 border-rose-200 animate-pulse'
                          : 'bg-amber-100 text-amber-800 border-amber-200'
                      }`}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      <span>{secondsLeft}s remaining</span>
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-100/80">
                  <p className="text-[11px] text-slate-500">
                    Created {new Date(hold.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === holdId}
                      onClick={() => void rejectHold(holdId)}
                      className="flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-[#C0362C] hover:bg-rose-50 disabled:opacity-60 transition"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>{busyId === holdId ? 'Processing…' : 'Reject'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyId === holdId}
                      onClick={() => void confirmHold(holdId)}
                      className="flex items-center gap-1 rounded-lg bg-[#2E7D4F] hover:bg-[#256640] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs disabled:opacity-60 transition"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>{busyId === holdId ? 'Confirming…' : 'Confirm Bed'}</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
