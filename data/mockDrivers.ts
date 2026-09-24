import { AmbulanceDriver } from '../types';

export const INITIAL_DRIVERS: AmbulanceDriver[] = [
  { id: 'driver-1', name: 'Vikram Singh', phone: '+91 99112-23344', licenseNumber: 'DL-0420110088123', ambulanceId: 'A-12', status: 'En Route' },
  { id: 'driver-2', name: 'Rajesh Kumar', phone: '+91 98223-34455', licenseNumber: 'DL-0420150046712', ambulanceId: 'A-08', status: 'Available' },
  { id: 'driver-3', name: 'Sunil Yadav', phone: '+91 97334-45566', licenseNumber: 'DL-0420130091456', ambulanceId: 'A-15', status: 'On Duty' },
  { id: 'driver-4', name: 'Amit Verma', phone: '+91 96445-56677', licenseNumber: 'DL-0420180019324', ambulanceId: 'A-22', status: 'On Duty' },
  { id: 'driver-5', name: 'Deepak Sharma', phone: '+91 95556-67788', licenseNumber: 'DL-0420160075401', ambulanceId: 'A-04', status: 'Available' },
];
