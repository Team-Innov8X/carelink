import React, { useEffect, useRef, useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import type * as Leaflet from 'leaflet';

interface MapViewProps {
  center?: [number, number];
  zoom?: number;
  height?: string;
  focusAmbulanceId?: string;
  focusHospitalId?: string;
  showRouteLine?: boolean;
}

export const MapView: React.FC<MapViewProps> = ({
  center = [28.618, 77.215],
  zoom = 13,
  height = '360px',
  focusAmbulanceId,
  focusHospitalId,
  showRouteLine = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Leaflet.Map | null>(null);
  const markersLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const routeLineRef = useRef<Leaflet.Polyline | null>(null);
  const leafletRef = useRef<typeof import('leaflet').default | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const { ambulances, hospitals, emergencies, setSelectedEmergencyId, setActiveTab } =
    useCareLink();

  // Initialize Map
  useEffect(() => {
    let cancelled = false;
    let map: Leaflet.Map | null = null;

    const initializeMap = async () => {
      if (!mapContainerRef.current || mapInstanceRef.current) return;
      const { default: L } = await import('leaflet');
      if (cancelled || !mapContainerRef.current) return;
      leafletRef.current = L;

      map = L.map(mapContainerRef.current, {
        center,
        zoom,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
      }).addTo(map);

      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;
      mapInstanceRef.current = map;
      setMapReady(true);

      // Fix map size after mounting
      setTimeout(() => {
        map?.invalidateSize();
      }, 200);
    };

    void initializeMap();
    return () => {
      cancelled = true;
      map?.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  // Update Markers and Route Lines
  useEffect(() => {
    const L = leafletRef.current;
    if (!mapReady || !L || !mapInstanceRef.current || !markersLayerRef.current) return;

    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    markersLayer.clearLayers();

    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }

    // 1. Hospital Markers (Blue with 'H')
    hospitals.forEach((hosp) => {
      const isSelected = hosp.id === focusHospitalId;
      const customIcon = L.divIcon({
        className: 'custom-map-icon',
        html: `
          <div class="relative flex items-center justify-center cursor-pointer group">
            <div class="w-8 h-8 rounded-full ${
              isSelected ? 'bg-sky-600 ring-4 ring-sky-300' : 'bg-sky-500'
            } text-white font-extrabold text-sm flex items-center justify-center shadow-lg border-2 border-white">
              H
            </div>
            <div class="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap opacity-90 group-hover:opacity-100 pointer-events-none">
              ${hosp.name.split(' ')[0]}
            </div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([hosp.location.lat, hosp.location.lng], { icon: customIcon });
      marker.bindPopup(`
        <div style="font-family: sans-serif; padding: 4px;">
          <h4 style="margin: 0 0 4px; font-size: 14px; font-weight: 700; color: #0f172a;">${hosp.name}</h4>
          <p style="margin: 0 0 6px; font-size: 11px; color: #64748b;">${hosp.location.address}</p>
          <div style="display: flex; gap: 6px; font-size: 11px; margin-bottom: 6px;">
            <span style="background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-weight: 600;">Gen: ${hosp.beds.general.available}/${hosp.beds.general.total}</span>
            <span style="background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-weight: 600;">ICU: ${hosp.beds.icu.available}/${hosp.beds.icu.total}</span>
            <span style="background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px; font-weight: 600;">Trauma: ${hosp.beds.trauma.available}/${hosp.beds.trauma.total}</span>
          </div>
          <div style="font-size: 11px; font-weight: 600; color: ${hosp.status === 'Available' ? '#16a34a' : hosp.status === 'Limited' ? '#d97706' : '#dc2626'};">
            Status: ${hosp.status} • ETA: ${hosp.etaMin} min
          </div>
        </div>
      `);
      markersLayer.addLayer(marker);
    });

    // 2. Ambulance Markers (Red/Cyan flashing)
    ambulances.forEach((amb) => {
      const isEnRoute = amb.status === 'En Route';
      const customIcon = L.divIcon({
        className: 'custom-ambulance-icon',
        html: `
          <div class="relative flex items-center justify-center cursor-pointer">
            ${
              isEnRoute
                ? '<div class="absolute -inset-1 rounded-full bg-rose-500 animate-ping opacity-60"></div>'
                : ''
            }
            <div class="w-8 h-8 rounded-full ${
              isEnRoute ? 'bg-rose-600' : 'bg-amber-500'
            } text-white flex items-center justify-center shadow-lg border-2 border-white text-base">
              🚑
            </div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([amb.location.lat, amb.location.lng], { icon: customIcon });
      marker.bindPopup(`
        <div style="font-family: sans-serif; padding: 4px;">
          <h4 style="margin: 0 0 2px; font-size: 13px; font-weight: 700; color: #0f172a;">Ambulance ${amb.id} (${amb.vehicleNumber})</h4>
          <p style="margin: 0 0 4px; font-size: 11px; color: #64748b;">Driver: ${amb.driverName} • ${amb.phone}</p>
          <span style="display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; background: ${
            amb.status === 'En Route' ? '#ffe4e6' : '#fef3c7'
          }; color: ${amb.status === 'En Route' ? '#be123c' : '#b45309'};">
            ${amb.status.toUpperCase()}
          </span>
        </div>
      `);
      markersLayer.addLayer(marker);
    });

    // 3. Patient Requests Markers (Orange/Red alert pins)
    emergencies
      .filter((req) => req.status !== 'Completed')
      .forEach((req) => {
        const isHigh = req.priority === 'High' || req.priority === 'Critical';
        const customIcon = L.divIcon({
          className: 'custom-patient-icon',
          html: `
            <div class="relative flex items-center justify-center cursor-pointer group">
              <div class="w-7 h-7 rounded-full ${
                isHigh ? 'bg-rose-500' : 'bg-amber-500'
              } text-white flex items-center justify-center shadow-lg border-2 border-white font-bold text-xs">
                ⚠️
              </div>
              <div class="absolute -top-6 left-1/2 -translate-x-1/2 bg-rose-900 text-white text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap">
                ${req.id}
              </div>
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const marker = L.marker([req.location.lat, req.location.lng], { icon: customIcon });
        marker.on('click', () => {
          setSelectedEmergencyId(req.id);
        });
        marker.bindPopup(`
          <div style="font-family: sans-serif; padding: 4px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-weight: 800; color: #e11d48; font-size: 12px;">${req.id} • ${req.priority} Priority</span>
            </div>
            <h4 style="margin: 0 0 2px; font-size: 13px; font-weight: 700;">${req.condition}</h4>
            <p style="margin: 0 0 6px; font-size: 11px; color: #64748b;">📍 ${req.location.address}</p>
            <div style="font-size: 11px; font-weight: 600; color: #2563eb;">Status: ${req.status}</div>
          </div>
        `);
        markersLayer.addLayer(marker);
      });

    // 4. Draw route line if requested (e.g. from P-1023 to City Care Hospital)
    if (showRouteLine) {
      const activeEmergency = emergencies.find((e) => e.id === 'P-1023');
      const targetHospital = hospitals.find((h) => h.id === 'hosp-1');
      if (activeEmergency && targetHospital) {
        const polyline = L.polyline(
          [
            [activeEmergency.location.lat, activeEmergency.location.lng],
            [28.619, 77.214], // Ambulance A-12 midway
            [targetHospital.location.lat, targetHospital.location.lng],
          ],
          {
            color: '#2563eb',
            weight: 4,
            dashArray: '8, 8',
            opacity: 0.8,
          }
        ).addTo(map);
        routeLineRef.current = polyline;
      }
    }
  }, [ambulances, hospitals, emergencies, focusHospitalId, showRouteLine, mapReady]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100" style={{ height }}>
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Legend matching Screen 2 mockup */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur-sm px-3.5 py-2 rounded-xl shadow-md border border-slate-200/80 flex items-center gap-4 text-xs font-medium text-slate-700">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-rose-600 flex items-center justify-center text-[8px] text-white">🚑</span>
          <span>Ambulance</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-sky-600 flex items-center justify-center text-[8px] font-bold text-white">H</span>
          <span>Hospital</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-500 flex items-center justify-center text-[8px] text-white">⚠️</span>
          <span>Patient Request</span>
        </div>
      </div>
    </div>
  );
};
