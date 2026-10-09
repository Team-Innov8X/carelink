'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCareLink } from '../../context/CareLinkContext';
import type * as Leaflet from 'leaflet';

export type MapFacility = {
  id: string;
  name: string;
  type?: 'hospital' | 'pharmacy';
  location: { lat: number; lng: number; address?: string | null };
  registered: boolean;
  label?: string;
  beds?: { total: number; available: number };
  doctors?: { count: number };
  status?: string;
};

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
  hospitalLocation?: [number, number];
  showNetworkMarkers?: boolean;
  driverLocations?: { id: string; name?: string; location: [number, number]; distanceKm?: number }[];
  facilities?: MapFacility[];
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
  hospitalLocation,
  showNetworkMarkers = true,
  driverLocations = [],
  facilities,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const layersRef = useRef<Leaflet.LayerGroup | null>(null);
  const routeRef = useRef<Leaflet.Polyline | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [routeResult, setRouteResult] = useState<{ key: string; path: [number, number][] } | null>(null);
  const [fetchedFacilities, setFetchedFacilities] = useState<MapFacility[]>([]);
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
  }, [center, emergency?.location, ambulance?.location, hospital?.location]);
  const mapCenterRef = useRef<[number, number] | null>(mapCenter);
  const hasMapCenter = mapCenter !== null;
  const routeKey = patientLocation && driverLocation
    ? [driverLocation, patientLocation, ...(hospitalLocation ? [hospitalLocation] : [])].map(([lat, lng]) => `${lat},${lng}`).join('|')
    : '';
  useEffect(() => { mapCenterRef.current = mapCenter; }, [mapCenter]);
  const routedPath = routeResult?.key === routeKey ? routeResult.path : null;

  useEffect(() => {
    if (!routeKey) return;

    const controller = new AbortController();
    const coordinates = routeKey.split('|').map((point) => point.split(',').map(Number));
    const routeCoordinates = coordinates.map(([lat, lng]) => `${lng},${lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${routeCoordinates}?overview=full&geometries=geojson&steps=false`;

    void fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Road route service is unavailable');
        return response.json();
      })
      .then((result: { code?: string; routes?: { geometry?: { coordinates?: [number, number][] } }[] }) => {
        const coordinates = result.code === 'Ok' ? result.routes?.[0]?.geometry?.coordinates : undefined;
        if (coordinates?.length) setRouteResult({ key: routeKey, path: coordinates.map(([lng, lat]) => [lat, lng]) });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.warn('Could not load the road route; showing a direct map line instead.', error);
        }
      });

    return () => controller.abort();
  }, [routeKey]);
  const currentRoutedPath = routeKey ? routedPath : null;

  useEffect(() => {
    if (facilities && facilities.length > 0) return;
    if (!mapCenter) return;
    const [lat, lng] = mapCenter;
    const controller = new AbortController();
    void fetch(`/api/nearby-facilities?lat=${lat}&lng=${lng}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { facilities?: MapFacility[] } | null) => {
        if (data?.facilities && Array.isArray(data.facilities)) {
          setFetchedFacilities(data.facilities);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [facilities, mapCenter]);

  const activeFacilities = facilities && facilities.length > 0 ? facilities : fetchedFacilities;

  useEffect(() => {
    let active = true;
    let map: Leaflet.Map | null = null;
    let resizeObserver: ResizeObserver | null = null;

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
      resizeObserver = new ResizeObserver(() => map?.invalidateSize({ animate: false, pan: false }));
      resizeObserver.observe(containerRef.current);
      requestAnimationFrame(() => map?.invalidateSize({ animate: false, pan: false }));
      setMapError('');
      setMapReady(true);
    }).catch((error: unknown) => {
      if (active) setMapError(error instanceof Error ? error.message : 'The map could not be loaded.');
    });

    return () => {
      active = false;
      resizeObserver?.disconnect();
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
  }, [hasMapCenter, zoom]);

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

    if (activeFacilities.length > 0) {
      activeFacilities.forEach((item) => {
        const isRegistered = item.registered;
        const markerColor = isRegistered ? '#2E7D4F' : '#64748B'; // Registered green vs Unregistered grey
        const markerLetter = item.type === 'pharmacy' ? 'Rx' : 'H';
        const labelBadge = isRegistered
          ? '<span style="background:#2E7D4F;color:white;font-size:10px;font-weight:bold;padding:2px 6px;border-radius:4px">Live data</span>'
          : '<div style="background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:600;margin-top:5px">Not registered — availability unknown, call to confirm</div>';

        const bedsLine = isRegistered && item.beds
          ? `<p style="margin:2px 0 0;font-size:12px;color:#334155">Beds: <b>${item.beds.available}</b> available / ${item.beds.total} total</p>`
          : '';
        const doctorsLine = isRegistered && item.doctors
          ? `<p style="margin:2px 0 0;font-size:12px;color:#334155">Doctors: <b>${item.doctors.count}</b> on roster</p>`
          : '';
        const statusLine = isRegistered && item.status
          ? `<p style="margin:3px 0 0;font-size:11px;color:#2E7D4F;font-weight:bold">Status: ${escapeHtml(item.status)}</p>`
          : '';

        const addressHtml = item.location.address
          ? `<p style="margin:2px 0 4px;font-size:12px;color:#64748b">${escapeHtml(item.location.address)}</p>`
          : '';

        const html = `<div style="font:13px Arial,sans-serif;max-width:280px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:3px">
            <strong>${escapeHtml(item.name)}</strong>
            ${isRegistered ? labelBadge : ''}
          </div>
          ${addressHtml}
          ${bedsLine}
          ${doctorsLine}
          ${statusLine}
          ${!isRegistered ? labelBadge : ''}
        </div>`;

        addMarker([item.location.lat, item.location.lng], markerLetter, markerColor, item.name, html);
      });
    } else if (showNetworkMarkers) {
      hospitals.forEach((item) => {
        const selected = item.id === hospital?.id;
        const color = item.status === 'Available' ? '#2E7D4F' : item.status === 'Limited' ? '#d97706' : '#dc2626';
        addMarker(
          [item.location.lat, item.location.lng], 'H', selected ? '#0369a1' : color, item.name,
          `<div style="font:13px Arial,sans-serif;max-width:280px"><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.location.address)}</p><p>General ${item.beds.general.available}/${item.beds.general.total} · ICU ${item.beds.icu.available}/${item.beds.icu.total} · Trauma ${item.beds.trauma.available}/${item.beds.trauma.total}</p><b>Status: ${escapeHtml(item.status)} · ETA: ${item.etaMin} min</b></div>`,
        );
      });
    }

    if (showNetworkMarkers) ambulances.forEach((item) => addMarker(
      [item.location.lat, item.location.lng], 'A', item.status === 'En Route' ? '#e11d48' : '#f59e0b', `Ambulance ${item.id}`,
      `<div style="font:13px Arial,sans-serif"><strong>Ambulance ${escapeHtml(item.id)} (${escapeHtml(item.vehicleNumber)})</strong><p>Driver: ${escapeHtml(item.driverName)} · ${escapeHtml(item.phone)}</p><b>${escapeHtml(item.status)}</b></div>`,
    ));

    if (showNetworkMarkers) emergencies.filter((item) => item.status !== 'Completed').forEach((item) => addMarker(
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
    if (hospitalLocation) {
      addMarker(hospitalLocation, 'H', '#0369a1', 'Assigned hospital', '<strong>Assigned hospital</strong><br/>Destination');
    }
    driverLocations.forEach((driver, index) => {
      const sharesPatientLocation = patientLocation && L.latLng(patientLocation).distanceTo(L.latLng(driver.location)) < 30;
      const icon = L.divIcon({ className: '', html: '<div style="width:34px;height:34px;border-radius:50%;background:#0284c7;border:3px solid white;box-shadow:0 2px 8px #0f172a66;color:white;font:bold 12px Arial;display:grid;place-items:center">D</div>', iconSize: [34, 34], iconAnchor: sharesPatientLocation ? [5, 17] : [17, 17] });
      const distance = driver.distanceKm === undefined ? '' : ` · ${driver.distanceKm} km away`;
      const driverName = driver.name ? escapeHtml(driver.name) : `Driver ${index + 1}`;
      L.marker(driver.location, { icon, title: `Nearby available driver: ${driverName}` }).bindPopup(`<strong>${driverName}</strong><br/>Available driver${distance}`).addTo(layers);
    });

    const sosRoute = patientLocation && driverLocation ? [driverLocation, patientLocation, ...(hospitalLocation ? [hospitalLocation] : [])] as [number, number][] : null;
    if (sosRoute) {
      routeRef.current = L.polyline(currentRoutedPath ?? sosRoute, {
        color: '#e11d48',
        weight: currentRoutedPath ? 5 : 4,
        opacity: 0.9,
        ...(currentRoutedPath ? {} : { dashArray: '8 8' }),
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
    const focusedPoint = (currentRoutedPath ?? sosRoute) ?? (nearbyLocations.length > 1 ? nearbyLocations : showRouteLine && ambulance && hospital
      ? [[ambulance.location.lat, ambulance.location.lng], [hospital.location.lat, hospital.location.lng]] as [number, number][]
      : null);
    if (focusedPoint) map.fitBounds(focusedPoint, { padding: [40, 40], maxZoom: 14, animate: false });
    else map.setView(mapCenter, zoom, { animate: false });
  }, [mapReady, mapCenter, zoom, ambulances, hospitals, emergencies, hospital, showNetworkMarkers, showRouteLine, ambulance, patientLocation, patientName, driverLocation, hospitalLocation, driverLocations, currentRoutedPath, setSelectedEmergencyId, activeFacilities]);

  if (!mapCenter) {
    return <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500" style={{ height }}>No location records to show.</div>;
  }

  return (
    <div className="relative isolate w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm" style={{ height }}>
      <div ref={containerRef} className="h-full w-full" aria-label="Map showing ambulances, hospitals, and emergency requests" />
      {mapError && <div role="status" className="absolute inset-x-3 top-3 z-[1000] rounded-lg bg-white/95 px-3 py-2 text-xs font-medium text-rose-700 shadow">{mapError}</div>}
      <div className="absolute bottom-3 left-3 z-[1000] flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/80 bg-white/95 px-3.5 py-2 text-xs font-medium text-slate-700 shadow-md backdrop-blur-sm">
        {patientLocation ? <span><b className="text-rose-600">P</b> You / patient</span> : <span>🚑 Ambulance</span>}
        {driverLocations.length > 0 || driverLocation ? <span><b className="text-sky-600">D</b> Nearby driver</span> : null}
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-[#2E7D4F]" /> Registered (Live data)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-[#64748B]" /> Not registered</span>
        {!patientLocation && <span><b className="text-rose-600">!</b> Patient Request</span>}
      </div>
    </div>
  );
};
