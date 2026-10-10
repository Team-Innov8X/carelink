export function routeForRole(role?: string) {
  // Accept legacy/API role spellings as well as the canonical values used by
  // the signup flow. Older accounts may store spaces or hyphens in the role.
  const normalizedRole = role?.trim().toLowerCase().replace(/[\s-]+/g, '_');
  switch (normalizedRole) {
    case 'hospital_admin':
    case 'hospital':
    case 'hospital_staff':
      return '/hospital-admin';
    case 'pharmacy':
      return '/pharmacy-dashboard';
    case 'patient':
      return '/patient-dashboard';
    case 'driver':
    case 'ambulance_driver':
    case 'ambulance':
    case 'paramedic':
      return '/driver-dashboard';
    case 'dispatcher':
      return '/dispatcher';
    default:
      return '/';
  }
}

