'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
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

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char] as string));

export const MapView: React.FC<MapViewProps> = ({
  center,
  zoom = 13,
  height = '360px',
  focusAmbulanceId,
  focusHospitalId,
  showRouteLine = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const layersRef = useRef<Leaflet.LayerGroup | null>(null);
  const routeRef = useRef<Leaflet.Polyline | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const { ambulances, hospitals, emergencies, selectedEmergencyId, setSelectedEmergencyId } = useCareLink();

  const emergency = emergencies.find((item) => item.id === selectedEmergencyId) ?? emergencies[0];
  const ambulance = ambulances.find((item) => item.id === (focusAmbulanceId ?? emergency?.assignedAmbulanceId))
    ?? ambulances.find((item) => item.status === 'Available' || item.status === 'On Duty');
  const hospital = hospitals.find((item) => item.id === (focusHospitalId ?? emergency?.assignedHospitalId))
    ?? hospitals.find((item) => item.status === 'Available');
  const mapCenter = useMemo<[number, number] | null>(() => {
    if (center) return center;
    const point = emergency?.location ?? ambulance?.location ?? hospital?.location;
    return point ? [point.lat, point.lng] : null;
  }, [center, emergency?.location.lat, emergency?.location.lng, ambulance?.location.lat, ambulance?.location.lng, hospital?.location.lat, hospital?.location.lng]);

  useEffect(() => {
    let active = true;
    let map: Leaflet.Map | null = null;

    if (!mapCenter) {
      setMapReady(false);
      return;
    }

    void import('leaflet').then(({ default: L }) => {
      if (!active || !containerRef.current) return;
      leafletRef.current = L;
      map = L.map(containerRef.current, { center: mapCenter, zoom, scrollWheelZoom: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
      }).addTo(map);
      layersRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapError('');
      setMapReady(true);
    }).catch((error: unknown) => {
      if (active) setMapError(error instanceof Error ? error.message : 'The map could not be loaded.');
    });

    return () => {
      active = false;
      map?.remove();
      mapRef.current = null;
      layersRef.current = null;
      routeRef.current = null;
      leafletRef.current = null;
      setMapReady(false);
    };
  }, [mapCenter, zoom]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!mapReady || !L || !map || !layers || !mapCenter) return;

    layers.clearLayers();
    routeRef.current?.removeFrom(map);
    routeRef.current = null;

    const addMarker = (point: [number, number], letter: string, color: string, title: string, html: string, onClick?: () => void) => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:30px;height:30px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px #0f172a66;color:white;font:bold 13px Arial;display:grid;place-items:center">${letter}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      const marker = L.marker(point, { icon, title }).bindPopup(html).addTo(layers);
      if (onClick) marker.on('click', onClick);
    };

    hospitals.forEach((item) => {
      const selected = item.id === hospital?.id;
      const color = item.status === 'Available' ? '#0284c7' : item.status === 'Limited' ? '#d97706' : '#dc2626';
      addMarker(
        [item.location.lat, item.location.lng], 'H', selected ? '#0369a1' : color, item.name,
        `<div style="font:13px Arial,sans-serif;max-width:280px"><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.location.address)}</p><p>General ${item.beds.general.available}/${item.beds.general.total} · ICU ${item.beds.icu.available}/${item.beds.icu.total} · Trauma ${item.beds.trauma.available}/${item.beds.trauma.total}</p><b>Status: ${escapeHtml(item.status)} · ETA: ${item.etaMin} min</b></div>`,
      );
    });

    ambulances.forEach((item) => addMarker(
      [item.location.lat, item.location.lng], 'A', item.status === 'En Route' ? '#e11d48' : '#f59e0b', `Ambulance ${item.id}`,
      `<div style="font:13px Arial,sans-serif"><strong>Ambulance ${escapeHtml(item.id)} (${escapeHtml(item.vehicleNumber)})</strong><p>Driver: ${escapeHtml(item.driverName)} · ${escapeHtml(item.phone)}</p><b>${escapeHtml(item.status)}</b></div>`,
    ));

    emergencies.filter((item) => item.status !== 'Completed').forEach((item) => addMarker(
      [item.location.lat, item.location.lng], '!', item.priority === 'High' || item.priority === 'Critical' ? '#e11d48' : '#f59e0b', `Emergency ${item.id}`,
      `<div style="font:13px Arial,sans-serif"><strong>${escapeHtml(item.id)} · ${escapeHtml(item.priority)} Priority</strong><p>${escapeHtml(item.condition)}</p><p>${escapeHtml(item.location.address)}</p><b>Status: ${escapeHtml(item.status)}</b></div>`,
      () => setSelectedEmergencyId(item.id),
    ));

    if (showRouteLine && ambulance && hospital) {
      routeRef.current = L.polyline([
        [ambulance.location.lat, ambulance.location.lng],
        [hospital.location.lat, hospital.location.lng],
      ], { color: '#2563eb', weight: 5, opacity: 0.85, dashArray: '8 8' }).addTo(map);
    }

    const focusedPoint = showRouteLine && ambulance && hospital
      ? [[ambulance.location.lat, ambulance.location.lng], [hospital.location.lat, hospital.location.lng]] as [number, number][]
      : null;
    if (focusedPoint) map.fitBounds(focusedPoint, { padding: [40, 40], maxZoom: 14 });
    else map.setView(mapCenter, zoom);
  }, [mapReady, mapCenter, zoom, ambulances, hospitals, emergencies, hospital, showRouteLine, ambulance, setSelectedEmergencyId]);

  if (!mapCenter) {
    return <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500" style={{ height }}>No location records to show.</div>;
  }

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm" style={{ height }}>
      <div ref={containerRef} className="h-full w-full" aria-label="Map showing ambulances, hospitals, and emergency requests" />
      {mapError && <div role="status" className="absolute inset-x-3 top-3 z-[1000] rounded-lg bg-white/95 px-3 py-2 text-xs font-medium text-rose-700 shadow">{mapError}</div>}
      <div className="absolute bottom-3 left-3 z-[1000] flex items-center gap-4 rounded-xl border border-slate-200/80 bg-white/95 px-3.5 py-2 text-xs font-medium text-slate-700 shadow-md backdrop-blur-sm">
        <span>🚑 Ambulance</span><span><b className="text-sky-600">H</b> Hospital</span><span><b className="text-rose-600">!</b> Patient Request</span>
      </div>
    </div>
  );
};
