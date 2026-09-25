export function routeForRole(role?: string) {
  switch (role) {
    case 'hospital':
    case 'hospital_staff':
      return '/hospital-admin';
    case 'pharmacy':
      return '/pharmacy-dashboard';
    case 'patient':
      return '/';
    case 'driver':
    case 'ambulance_driver':
    case 'paramedic':
      return '/driver-dashboard';
    case 'dispatcher':
      return '/';
    default:
      return '/';
  }
}
