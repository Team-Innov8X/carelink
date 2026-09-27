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
  patientLocation?: [number, number];
  patientName?: string;
  driverLocation?: [number, number];
  driverLocations?: { id: string; name?: string; location: [number, number]; distanceKm?: number }[];
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
  patientLocation,
  patientName,
  driverLocation,
  driverLocations = [],
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const layersRef = useRef<Leaflet.LayerGroup | null>(null);
  const routeRef = useRef<Leaflet.Polyline | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [routedPath, setRoutedPath] = useState<[number, number][] | null>(null);
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
  const mapCenterRef = useRef<[number, number] | null>(mapCenter);
  mapCenterRef.current = mapCenter;
  const routeKey = patientLocation && driverLocation
    ? `${driverLocation[0]},${driverLocation[1]}|${patientLocation[0]},${patientLocation[1]}`
    : '';

  useEffect(() => {
    if (!routeKey) {
      setRoutedPath(null);
      return;
    }

    const controller = new AbortController();
    setRoutedPath(null);
    const [origin, destination] = routeKey.split('|').map((point) => point.split(',').map(Number));
    const url = `https://router.project-osrm.org/route/v1/driving/${origin[1]},${origin[0]};${destination[1]},${destination[0]}?overview=full&geometries=geojson&steps=false`;

    void fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Road route service is unavailable');
        return response.json();
      })
      .then((result: { code?: string; routes?: { geometry?: { coordinates?: [number, number][] } }[] }) => {
        const coordinates = result.code === 'Ok' ? result.routes?.[0]?.geometry?.coordinates : undefined;
        if (coordinates?.length) setRoutedPath(coordinates.map(([lng, lat]) => [lat, lng]));
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.warn('Could not load the road route; showing a direct map line instead.', error);
        }
      });

    return () => controller.abort();
  }, [routeKey]);

  useEffect(() => {
    let active = true;
    let map: Leaflet.Map | null = null;

    const initialCenter = mapCenterRef.current;
    if (!initialCenter) {
      setMapReady(false);
      return;
    }

    void import('leaflet').then(({ default: L }) => {
      if (!active || !containerRef.current) return;
      leafletRef.current = L;
      map = L.map(containerRef.current, {
        center: initialCenter,
        zoom,
        scrollWheelZoom: true,
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false,
        inertia: false,
      });
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
      map?.stop();
      map?.remove();
      mapRef.current = null;
      layersRef.current = null;
      routeRef.current = null;
      leafletRef.current = null;
      setMapReady(false);
    };
  // Do not recreate Leaflet when the user or request changes the map center.
  // Teardown during an in-flight Leaflet transition can leave stale pane elements.
  }, [Boolean(mapCenter), zoom]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!mapReady || !L || !map || !layers || !mapCenter) return;

    // Requests can refresh while Leaflet is panning; cancel any pending movement
    // before replacing marker layers or changing the visible bounds.
    map.stop();
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

    if (patientLocation) {
      const patientSharesDriverLocation = driverLocation
        ? L.latLng(patientLocation).distanceTo(L.latLng(driverLocation)) < 30
        : driverLocations.some((driver) => L.latLng(patientLocation).distanceTo(L.latLng(driver.location)) < 30);
      // Keep colocated patient/driver pins side by side so neither hides the other.
      const icon = L.divIcon({ className: '', html: '<div style="width:34px;height:34px;border-radius:50%;background:#e11d48;border:3px solid white;box-shadow:0 2px 8px #0f172a66;color:white;font:bold 12px Arial;display:grid;place-items:center">P</div>', iconSize: [34, 34], iconAnchor: patientSharesDriverLocation ? [29, 17] : [17, 17] });
      const label = patientName ? `${escapeHtml(patientName)} · Patient` : 'Patient';
      L.marker(patientLocation, { icon, title: `${label} location` }).bindPopup(`<strong>${label}</strong><br/>Pickup location`).addTo(layers);
    }
    if (driverLocation) {
      const sharesPatientLocation = patientLocation && L.latLng(patientLocation).distanceTo(L.latLng(driverLocation)) < 30;
      const icon = L.divIcon({ className: '', html: '<div style="width:34px;height:34px;border-radius:50%;background:#0284c7;border:3px solid white;box-shadow:0 2px 8px #0f172a66;color:white;font:bold 12px Arial;display:grid;place-items:center">D</div>', iconSize: [34, 34], iconAnchor: sharesPatientLocation ? [5, 17] : [17, 17] });
      L.marker(driverLocation, { icon, title: 'Driver GPS location' }).bindPopup('<strong>Driver GPS location</strong>').addTo(layers);
    }
    driverLocations.forEach((driver, index) => {
      const sharesPatientLocation = patientLocation && L.latLng(patientLocation).distanceTo(L.latLng(driver.location)) < 30;
      const icon = L.divIcon({ className: '', html: '<div style="width:34px;height:34px;border-radius:50%;background:#0284c7;border:3px solid white;box-shadow:0 2px 8px #0f172a66;color:white;font:bold 12px Arial;display:grid;place-items:center">D</div>', iconSize: [34, 34], iconAnchor: sharesPatientLocation ? [5, 17] : [17, 17] });
      const distance = driver.distanceKm === undefined ? '' : ` · ${driver.distanceKm} km away`;
      const driverName = driver.name ? escapeHtml(driver.name) : `Driver ${index + 1}`;
      L.marker(driver.location, { icon, title: `Nearby available driver: ${driverName}` }).bindPopup(`<strong>${driverName}</strong><br/>Available driver${distance}`).addTo(layers);
    });

    const sosRoute = patientLocation && driverLocation ? [driverLocation, patientLocation] as [number, number][] : null;
    if (sosRoute) {
      routeRef.current = L.polyline(routedPath ?? sosRoute, {
        color: '#e11d48',
        weight: routedPath ? 5 : 4,
        opacity: 0.9,
        ...(routedPath ? {} : { dashArray: '8 8' }),
      }).addTo(map);
    }

    if (!sosRoute && showRouteLine && ambulance && hospital) {
      routeRef.current = L.polyline([
        [ambulance.location.lat, ambulance.location.lng],
        [hospital.location.lat, hospital.location.lng],
      ], { color: '#2563eb', weight: 5, opacity: 0.85, dashArray: '8 8' }).addTo(map);
    }

    const nearbyLocations = [
      ...(patientLocation ? [patientLocation] : []),
      ...driverLocations.map((driver) => driver.location),
    ];
    const focusedPoint = (routedPath ?? sosRoute) ?? (nearbyLocations.length > 1 ? nearbyLocations : showRouteLine && ambulance && hospital
      ? [[ambulance.location.lat, ambulance.location.lng], [hospital.location.lat, hospital.location.lng]] as [number, number][]
      : null);
    if (focusedPoint) map.fitBounds(focusedPoint, { padding: [40, 40], maxZoom: 14, animate: false });
    else map.setView(mapCenter, zoom, { animate: false });
  }, [mapReady, mapCenter, zoom, ambulances, hospitals, emergencies, hospital, showRouteLine, ambulance, patientLocation, patientName, driverLocation, driverLocations, routedPath, setSelectedEmergencyId]);

  if (!mapCenter) {
    return <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500" style={{ height }}>No location records to show.</div>;
  }

  return (
    <div className="relative isolate w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm" style={{ height }}>
      <div ref={containerRef} className="h-full w-full" aria-label="Map showing ambulances, hospitals, and emergency requests" />
      {mapError && <div role="status" className="absolute inset-x-3 top-3 z-[1000] rounded-lg bg-white/95 px-3 py-2 text-xs font-medium text-rose-700 shadow">{mapError}</div>}
      <div className="absolute bottom-3 left-3 z-[1000] flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/80 bg-white/95 px-3.5 py-2 text-xs font-medium text-slate-700 shadow-md backdrop-blur-sm">
        {patientLocation ? <span><b className="text-rose-600">P</b> You / patient</span> : <span>🚑 Ambulance</span>}
        {driverLocations.length > 0 || driverLocation ? <span><b className="text-sky-600">D</b> Nearby driver</span> : <span><b className="text-sky-600">H</b> Hospital</span>}
        {!patientLocation && <span><b className="text-rose-600">!</b> Patient Request</span>}
      </div>
    </div>
  );
};
