import { Pharmacy } from '../types';

export const INITIAL_PHARMACIES: Pharmacy[] = [
  {
    id: 'pharm-1',
    name: 'HealthPlus Pharmacy',
    distanceKm: 2.3,
    address: 'Shop 4, Market Complex, Sector 4',
    phone: '+91 98765-43210',
    isOpen: true,
    location: { lat: 28.618, lng: 77.212 },
    rating: 4.8,
  },
  {
    id: 'pharm-2',
    name: 'MedLife Pharmacy',
    distanceKm: 5.6,
    address: 'Corner Block, MG Road Junction',
    phone: '+91 98111-22334',
    isOpen: true,
    location: { lat: 28.625, lng: 77.205 },
    rating: 4.6,
  },
  {
    id: 'pharm-3',
    name: 'City Chemist',
    distanceKm: 8.9,
    address: 'Station Square, Opposite Central Metro',
    phone: '+91 98222-33445',
    isOpen: true,
    location: { lat: 28.635, lng: 77.225 },
    rating: 4.3,
  },
  {
    id: 'pharm-4',
    name: 'Apollo 24x7 Pharmacy',
    distanceKm: 3.8,
    address: 'Ground Floor, Sunrise Complex, East Ave',
    phone: '+91 98333-44556',
    isOpen: true,
    location: { lat: 28.629, lng: 77.219 },
    rating: 4.9,
  },
];
