import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCareLink } from '../../context/CareLinkContext';
import { LogOut } from '@/components/icons';
import { authClient } from '../../lib/auth-client';

export const SettingsView: React.FC = () => {
  const { resetAllData } = useCareLink();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [settings, setSettings] = useState({ staleThresholdMinutes: 10, weights: { resource: 50, travel: 30, freshness: 20 } });
  const [settingsMessage, setSettingsMessage] = useState('');
  useEffect(() => { fetch('/api/settings', { cache: 'no-store' }).then((response) => response.json()).then((result) => { if (result.settings) setSettings(result.settings); }).catch(() => setSettingsMessage('Settings could not be loaded.')); }, []);
  const saveSettings = async () => {
    const response = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
    const result = await response.json();
    setSettingsMessage(response.ok ? 'Settings saved. Smart Match and hospital freshness indicators use these values.' : result.error || 'Could not save settings.');
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await authClient.signOut();
      router.push('/signin');
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">System Configuration</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          CareLink emergency response, telemetry sync & regional ER protocols
        </p>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-sm text-slate-900">Double Booking Protection</h3>
            <p className="text-xs text-slate-500">
              Atomic compare-and-reserve shared by patient and hospital requests
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
            ALWAYS ON
          </span>
        </div>

        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-sm text-slate-900">Stale Data Warning Threshold</h3>
            <p className="text-xs text-slate-500">Drives hospital stale warnings and Smart Match freshness scoring.</p>
          </div>
          <span className="font-mono font-bold text-xs bg-slate-100 px-3 py-1.5 rounded-lg text-slate-800">
            <input aria-label="Stale data threshold in minutes" type="number" min={1} max={120} value={settings.staleThresholdMinutes} onChange={(event) => setSettings((current) => ({ ...current, staleThresholdMinutes: Number(event.target.value) }))} className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right font-mono text-xs text-slate-800" /> min
          </span>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div>
            <h3 className="font-bold text-sm text-rose-700">Restore Demo Data</h3>
            <p className="text-xs text-slate-500">
              Replace current local data with the built-in sample records
            </p>
          </div>
          <button
            onClick={() => {
              if (confirm('Replace current local data with the built-in sample records?')) {
                resetAllData();
              }
            }}
            className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 transition-colors"
          >
            Restore Samples
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"><h2 className="font-bold text-slate-900">Smart Match score weights</h2><p className="mt-1 text-xs text-slate-500">Adjust the transparent ranking balance. The weights must total 100%.</p><div className="mt-4 grid gap-4 sm:grid-cols-3">{(['resource', 'travel', 'freshness'] as const).map((key) => <label key={key} className="text-xs font-semibold capitalize text-slate-600">{key} match (%)<input type="number" min={0} max={100} value={settings.weights[key]} onChange={(event) => setSettings((current) => ({ ...current, weights: { ...current.weights, [key]: Number(event.target.value) } }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>)}</div><div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={() => void saveSettings()} className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white">Save settings</button><span className="text-xs text-slate-500">Total: {settings.weights.resource + settings.weights.travel + settings.weights.freshness}%</span></div>{settingsMessage && <p role="status" className="mt-3 text-sm text-sky-800">{settingsMessage}</p>}</section>

      <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div>
          <h3 className="font-bold text-sm text-slate-900">Sign out of CareLink</h3>
          <p className="mt-1 text-xs text-slate-500">End your current session and return to the sign-in page.</p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" />
          {isSigningOut ? 'Signing out…' : 'Log out'}
        </button>
      </div>
    </div>
  );
};
