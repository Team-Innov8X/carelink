'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import { submitBedRequest } from '../../utils/hospitalRequests';
import {
  Search,
  RotateCcw,
  Sparkles,
  Building2,
  Navigation,
  ExternalLink,
  LocateFixed,
  AlertCircle,
} from 'lucide-react';

export type DirectoryHospital = {
  id: string;
  _id?: string;
  name: string;
  code?: string;
  status: string;
  address?: { street?: string; city?: string; state?: string; zipCode?: string; country?: string } | string;
  contact?: { phone?: string; emergencyHotline?: string };
  location?: { coordinates?: [number, number]; address?: string };
  phone?: string;
  distanceKm?: number | null;
  directionsUrl?: string;
  specialties: string[];
  beds: {
    general: { available: number; total: number };
    icu: { available: number; total: number };
    trauma: { available: number; total: number };
    ventilators?: { available: number; total: number };
  };
};

export const HospitalDirectory: React.FC = () => {
  const {
    role,
    emergencies,
    selectedEmergencyId,
    setActiveTab,
    setSelectedHospitalId,
  } = useCareLink();

  const [hospitals, setHospitals] = useState<DirectoryHospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [patientCoords, setPatientCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<string>('Detecting your location…');

  const [searchQuery, setSearchQuery] = useState('');
  const [distanceFilter, setDistanceFilter] = useState('all');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [specialtyFilter, setSpecialtyFilter] = useState('all');
  const [requestingHospitalId, setRequestingHospitalId] = useState<string | null>(null);
  const [requestMessage, setRequestMessage] = useState('');

  // 1. Get patient's location
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPatientCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocationStatus('Using device GPS coordinates');
        },
        () => {
          setPatientCoords({ lat: 28.6139, lng: 77.209 });
          setLocationStatus('Using central location (Delhi)');
        },
        { timeout: 8000 }
      );
    } else {
      setPatientCoords({ lat: 28.6139, lng: 77.209 });
      setLocationStatus('GPS unavailable, using central location');
    }
  }, []);

  // 2. Fetch real hospitals from GET /api/hospitals
  const loadHospitals = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const params = new URLSearchParams({ view: 'patient' });
      if (patientCoords) {
        params.set('lat', String(patientCoords.lat));
        params.set('lng', String(patientCoords.lng));
      }

      if (distanceFilter === 'under10') params.set('radiusKm', '10');
      else if (distanceFilter === 'under15') params.set('radiusKm', '15');
      else if (distanceFilter === 'under20') params.set('radiusKm', '20');
      else params.set('radiusKm', '100');

      const response = await fetch(`/api/hospitals?${params.toString()}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to load registered hospitals from database.');
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        setHospitals(data);
      } else {
        setHospitals([]);
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Unable to connect to hospital registry.');
      setHospitals([]);
    } finally {
      setLoading(false);
    }
  }, [patientCoords, distanceFilter]);

  useEffect(() => {
    void loadHospitals();
  }, [loadHospitals]);

  // Client-side search and specialty filters
  const filteredHospitals = hospitals.filter((hosp) => {
    if (
      searchQuery &&
      !hosp.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !hosp.specialties.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()))
    ) {
      return false;
    }

    if (distanceFilter === 'under10' && hosp.distanceKm && hosp.distanceKm > 10) return false;
    if (distanceFilter === 'under15' && hosp.distanceKm && hosp.distanceKm > 15) return false;
    if (distanceFilter === 'under20' && hosp.distanceKm && hosp.distanceKm > 20) return false;

    if (availabilityFilter !== 'all' && hosp.status.toLowerCase() !== availabilityFilter.toLowerCase()) {
      return false;
    }

    if (
      specialtyFilter !== 'all' &&
      !hosp.specialties.some((s) => s.toLowerCase().includes(specialtyFilter.toLowerCase()))
    ) {
      return false;
    }

    return true;
  });

  const resetFilters = () => {
    setSearchQuery('');
    setDistanceFilter('all');
    setAvailabilityFilter('all');
    setSpecialtyFilter('all');
  };

  const handleRequestBed = async (hospitalId: string) => {
    const hospital = hospitals.find((item) => item.id === hospitalId);
    const emergency = emergencies.find((item) => item.id === selectedEmergencyId) ?? emergencies[0];
    if (!hospital || !emergency) {
      setRequestMessage('Select a patient request before requesting a bed.');
      return;
    }
    setRequestingHospitalId(hospitalId);
    setRequestMessage('');
    try {
      // Adapt hospital object for bed request
      const formattedHospital = {
        ...hospital,
        location: {
          lat: hospital.location?.coordinates ? hospital.location.coordinates[1] : 28.6139,
          lng: hospital.location?.coordinates ? hospital.location.coordinates[0] : 77.209,
          address: typeof hospital.address === 'string' ? hospital.address : hospital.address?.street || '',
        },
        beds: hospital.beds,
        distanceKm: hospital.distanceKm ?? 5,
        etaMin: Math.round((hospital.distanceKm || 5) * 2.5),
        specialtyDoctors: {},
        updatedAt: new Date().toISOString(),
      };
      const result = await submitBedRequest(formattedHospital, emergency);
      const routedHospital = result.request?.hospitalName || hospital.name;
      setRequestMessage(result.message || `${result.existing ? 'An open request is already waiting at' : 'Bed request sent to'} ${routedHospital}. Hospital staff will review it shortly.`);
    } catch (error) {
      setRequestMessage(error instanceof Error ? error.message : 'Could not send the bed request.');
    } finally {
      setRequestingHospitalId(null);
    }
  };

  const handleViewHospital = (hospitalId: string) => {
    setSelectedHospitalId(hospitalId);
    setActiveTab('hospital-view');
  };

  const formatAddress = (addr?: DirectoryHospital['address']) => {
    if (!addr) return 'Delhi, India';
    if (typeof addr === 'string') return addr;
    return [addr.street, addr.city, addr.state].filter(Boolean).join(', ');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Nearby Hospitals</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time ER bed availability, critical care capacity & verified doctors ({locationStatus})
          </p>
        </div>

        <button
          onClick={() => setActiveTab('recommendations')}
          className="px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-semibold text-xs rounded-xl shadow-md flex items-center gap-2 self-start sm:self-auto transition-all"
        >
          <Sparkles className="w-4 h-4" />
          <span>Patient Smart Match (AI)</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search hospitals by facility name or clinical specialty..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
          />
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Distance Filter */}
          <select
            value={distanceFilter}
            onChange={(e) => setDistanceFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-700 rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="all">Distance: Any radius</option>
            <option value="under10">Within 10 km</option>
            <option value="under15">Within 15 km</option>
            <option value="under20">Within 20 km</option>
          </select>

          {/* Availability Filter */}
          <select
            value={availabilityFilter}
            onChange={(e) => setAvailabilityFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-700 rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="all">Availability: All Statuses</option>
            <option value="active">Active</option>
            <option value="available">Available</option>
            <option value="busy">Busy</option>
            <option value="full">Full Capacity</option>
          </select>

          {/* Specialty Filter */}
          <select
            value={specialtyFilter}
            onChange={(e) => setSpecialtyFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-700 rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="all">Specialty: All Units</option>
            <option value="trauma">Trauma Care</option>
            <option value="cardio">Cardiology</option>
            <option value="icu">ICU / Critical Care</option>
            <option value="neuro">Neurology</option>
            <option value="pedia">Pediatrics</option>
          </select>

          {/* Reset Filters */}
          <button
            onClick={resetFilters}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            title="Reset All Filters"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Action Notification Message */}
      {requestMessage && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 shadow-2xs">
          {requestMessage}
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-16 text-center text-slate-500 space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent mx-auto" />
          <p className="font-semibold text-slate-700">Querying registered nearby facilities…</p>
        </div>
      ) : fetchError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Failed to load hospital registry</p>
            <p className="mt-1">{fetchError}</p>
            <button
              onClick={() => void loadHospitals()}
              className="mt-3 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
            >
              Retry
            </button>
          </div>
        </div>
      ) : filteredHospitals.length === 0 ? (
        /* Explicit Empty State per Item 9: "No nearby hospitals registered yet" */
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
            <Building2 className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">No nearby hospitals registered yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            There are currently no registered healthcare facilities found within your search area. Try expanding the distance filter or submit an emergency SOS request for countywide response.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => {
                setDistanceFilter('all');
                setSearchQuery('');
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
            >
              Expand Search Radius
            </button>
            <button
              onClick={() => void loadHospitals()}
              className="rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-sky-600/20 hover:bg-sky-500 transition"
            >
              Refresh Directory
            </button>
          </div>
        </div>
      ) : (
        /* Real Hospital Directory Table */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Hospital & Location</th>
                  <th className="py-3 px-4">Distance & ETA</th>
                  <th className="py-3 px-4">General Beds</th>
                  <th className="py-3 px-4">ICU Units</th>
                  <th className="py-3 px-4">Trauma Units</th>
                  <th className="py-3 px-4">Specialties</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredHospitals.map((hosp) => {
                  const isAvail = hosp.status.toLowerCase() === 'active' || hosp.status.toLowerCase() === 'available';
                  const isLimited = hosp.status.toLowerCase() === 'busy' || hosp.status.toLowerCase() === 'limited';
                  const isFull = hosp.status.toLowerCase() === 'full';
                  const etaMinutes = hosp.distanceKm ? Math.round(hosp.distanceKm * 2.5) : 10;

                  return (
                    <tr
                      key={hosp.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* Hospital Name & address */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 font-extrabold flex items-center justify-center shrink-0">
                            H
                          </div>
                          <div>
                            <div className="font-bold text-sm text-slate-900 group-hover:text-sky-600 transition-colors">
                              {hosp.name}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[220px]">
                              {formatAddress(hosp.address)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Distance & ETA */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-800">
                          {hosp.distanceKm !== null && hosp.distanceKm !== undefined ? `${hosp.distanceKm} km` : 'Near you'}
                        </div>
                        <div className="text-[11px] text-slate-400">ETA: ~{etaMinutes} min</div>
                      </td>

                      {/* General Beds */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-800 text-sm">
                          {hosp.beds.general.available}
                        </span>
                        <span className="text-slate-400 font-mono text-xs">
                          /{hosp.beds.general.total}
                        </span>
                      </td>

                      {/* ICU Beds */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span
                          className={`font-mono font-bold text-sm ${
                            hosp.beds.icu.available <= 1 ? 'text-rose-600' : 'text-amber-700'
                          }`}
                        >
                          {hosp.beds.icu.available}
                        </span>
                        <span className="text-slate-400 font-mono text-xs">
                          /{hosp.beds.icu.total}
                        </span>
                      </td>

                      {/* Trauma Beds */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span
                          className={`font-mono font-bold text-sm ${
                            hosp.beds.trauma.available === 0
                              ? 'text-rose-600 font-extrabold'
                              : 'text-slate-800'
                          }`}
                        >
                          {hosp.beds.trauma.available}
                        </span>
                        <span className="text-slate-400 font-mono text-xs">
                          /{hosp.beds.trauma.total}
                        </span>
                      </td>

                      {/* Specialization */}
                      <td className="py-4 px-4">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {hosp.specialties.slice(0, 3).map((spec) => (
                            <span
                              key={spec}
                              className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium"
                            >
                              {spec}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Status badge */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            isAvail
                              ? 'bg-emerald-100 text-emerald-800'
                              : isLimited
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isAvail ? 'bg-emerald-600' : isLimited ? 'bg-amber-600' : 'bg-rose-600'
                            }`}
                          />
                          {hosp.status}
                        </span>
                      </td>

                      {/* Action buttons */}
                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleViewHospital(hosp.id)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-colors"
                          >
                            Details
                          </button>

                          {hosp.directionsUrl && (
                            <a
                              href={hosp.directionsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-800 font-semibold text-xs transition-colors"
                            >
                              <Navigation className="w-3.5 h-3.5" />
                              <span>Route</span>
                            </a>
                          )}

                          {role !== 'patient' && (
                            <button
                              onClick={() => handleRequestBed(hosp.id)}
                              disabled={isFull || requestingHospitalId === hosp.id}
                              className={`px-3 py-1.5 rounded-lg font-semibold text-xs shadow-2xs transition-all ${
                                isFull
                                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                  : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-600/20'
                              }`}
                            >
                              {requestingHospitalId === hosp.id ? 'Sending…' : 'Request Bed'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
