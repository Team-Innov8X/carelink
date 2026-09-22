import { Ambulance } from '../types';

export const INITIAL_AMBULANCES: Ambulance[] = [
  {
    id: 'A-12',
    vehicleNumber: 'DL-01-AX-9941',
    driverName: 'Vikram Singh',
    phone: '+91 99112-23344',
    status: 'En Route',
    location: { lat: 28.619, lng: 77.214 },
    assignedRequestId: 'P-1023',
  },
  {
    id: 'A-08',
    vehicleNumber: 'DL-03-CB-1288',
    driverName: 'Rajesh Kumar',
    phone: '+91 98223-34455',
    status: 'On Duty',
    location: { lat: 28.632, lng: 77.208 },
    assignedRequestId: 'P-1025',
  },
  {
    id: 'A-15',
    vehicleNumber: 'DL-04-MK-5510',
    driverName: 'Sunil Yadav',
    phone: '+91 97334-45566',
    status: 'On Duty',
    location: { lat: 28.610, lng: 77.228 },
    assignedRequestId: 'P-1027',
  },
  {
    id: 'A-22',
    vehicleNumber: 'DL-02-TZ-7721',
    driverName: 'Amit Verma',
    phone: '+91 96445-56677',
    status: 'Available',
    location: { lat: 28.640, lng: 77.220 },
  },
  {
    id: 'A-04',
    vehicleNumber: 'DL-01-EE-3349',
    driverName: 'Deepak Sharma',
    phone: '+91 95556-67788',
    status: 'Available',
    location: { lat: 28.585, lng: 77.215 },
  },
];
