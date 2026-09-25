import React from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import {
  LayoutDashboard,
  Building2,
  Pill,
  HeartHandshake,
} from 'lucide-react';

export const MobileNav: React.FC = () => {
  const { activeTab, setActiveTab, medicines } = useCareLink();
  const outOfStockCount = medicines.filter((medicine) =>
    Object.values(medicine.stock).some((quantity) => quantity === 0)
  ).length;

  const tabs: { id: string; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Home', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'hospitals', label: 'Hospitals', icon: <Building2 className="w-5 h-5" /> },
    { id: 'handoff', label: 'Handoff', icon: <HeartHandshake className="w-5 h-5" /> },
    { id: 'pharmacy', label: 'Pharmacy', icon: <Pill className="w-5 h-5" />, badge: outOfStockCount },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 md:hidden py-1.5 px-3 shadow-lg">
      <div className="flex items-center justify-around">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[10px] font-semibold transition-all relative ${
                isActive ? 'text-sky-600 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="relative">
                {tab.icon}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-2 w-4 h-4 bg-rose-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="mt-0.5">{tab.label}</span>
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-sky-600 mt-0.5"></span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
