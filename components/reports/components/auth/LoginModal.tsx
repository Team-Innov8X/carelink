import React, { useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import { Role } from '../../types';
import {
  Heart,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Radio,
  Stethoscope,
  Store,
  X,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const { role, setRole, setActiveTab } = useCareLink();
  const [email, setEmail] = useState('dispatcher@carelink.health');
  const [password, setPassword] = useState('••••••••••••');
  const [showPassword, setShowPassword] = useState(false);

  if (!isOpen) return null;

  const handleRoleQuickLogin = (selectedRole: Role) => {
    setRole(selectedRole);
    if (selectedRole === 'hospital') {
      setActiveTab('hospital-portal');
    } else if (selectedRole === 'pharmacy') {
      setActiveTab('pharmacy');
    } else {
      setActiveTab('dashboard');
    }
    onClose();
  };

  const handleStandardLogin = (e: React.FormEvent) => {
    e.preventDefault();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 border border-slate-200">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Left Hero Graphic Section (Mockup Panel 1) */}
        <div className="md:col-span-6 bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 p-8 text-white flex flex-col justify-between relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute top-0 left-0 w-72 h-72 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-72 h-72 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

          <div>
            {/* Logo */}
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 to-rose-600 flex items-center justify-center shadow-lg shadow-rose-900/30">
                <Heart className="w-6 h-6 fill-white text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tight leading-none text-white">
                  Care<span className="text-rose-400">Link</span>
                </h2>
                <span className="text-[11px] text-sky-200 font-medium">
                  Faster Care, Healthier Tomorrow
                </span>
              </div>
            </div>

            {/* Sub-tagline */}
            <div className="text-[11px] font-semibold text-rose-300 uppercase tracking-wider mt-3 mb-6 flex items-center gap-1.5 flex-wrap">
              <span>Emergency Response</span>
              <span>•</span>
              <span>Hospital Coordination</span>
              <span>•</span>
              <span>Medicine Access</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-2xl lg:text-3xl font-bold leading-snug tracking-tight text-white mb-4">
              Connecting Ambulances, Hospitals & Pharmacies for Better Care.
            </h1>

            <p className="text-sm text-slate-300 leading-relaxed">
              Real-time bed availability, smart hospital recommendations, seamless digital
              handoffs, and real-time medicine access — all in one unified platform.
            </p>
          </div>

          {/* Emergency Ambulance Showcase Card */}
          <div className="mt-8 pt-6 border-t border-slate-800/80">
            <div className="bg-slate-800/60 backdrop-blur-md rounded-2xl p-4 border border-slate-700/50 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-2xl shrink-0">
                🚑
              </div>
              <div className="text-xs">
                <div className="font-semibold text-white mb-0.5 flex items-center gap-1.5">
                  <span>Unified Emergency Dispatch</span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                    ACTIVE
                  </span>
                </div>
                <p className="text-slate-400">
                  Zero delays between field paramedics, ER bed allocation, and vital drug reserves.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Form Section (Mockup Panel 1) */}
        <div className="md:col-span-6 p-8 lg:p-10 flex flex-col justify-center bg-white">
          <div className="mb-6">
            <h3 className="text-2xl font-bold text-slate-900">Welcome Back</h3>
            <p className="text-sm text-slate-500 mt-1">Sign in to continue to CareLink</p>
          </div>

          <form onSubmit={handleStandardLogin} className="space-y-4">
            {/* Email Field */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Email / Username
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 text-sm font-medium outline-none transition-all text-slate-800"
                  placeholder="name@organization.gov"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 text-sm font-medium outline-none transition-all text-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Sign in Button */}
            <button
              type="submit"
              className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-xl shadow-lg shadow-sky-600/20 transition-all text-sm mt-2"
            >
              Login
            </button>
          </form>

          {/* Quick Role Selection divider matching Mockup */}
          <div className="relative my-6 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <span className="relative px-3 bg-white text-xs font-medium text-slate-400 uppercase">
              or quick role switch
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => handleRoleQuickLogin('dispatcher')}
              className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                role === 'dispatcher'
                  ? 'border-sky-500 bg-sky-50/70 text-sky-700 font-semibold ring-2 ring-sky-200'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600'
              }`}
            >
              <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
                <Radio className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold">Dispatcher</span>
            </button>

            <button
              onClick={() => handleRoleQuickLogin('hospital')}
              className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                role === 'hospital'
                  ? 'border-emerald-500 bg-emerald-50/70 text-emerald-700 font-semibold ring-2 ring-emerald-200'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600'
              }`}
            >
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <Stethoscope className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold leading-tight">Hospital Staff</span>
            </button>

            <button
              onClick={() => handleRoleQuickLogin('pharmacy')}
              className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                role === 'pharmacy'
                  ? 'border-purple-500 bg-purple-50/70 text-purple-700 font-semibold ring-2 ring-purple-200'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600'
              }`}
            >
              <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
                <Store className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold">Pharmacy</span>
            </button>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            Don't have an account?{' '}
            <span className="text-sky-600 font-semibold cursor-pointer hover:underline">
              Contact your administrator
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};
