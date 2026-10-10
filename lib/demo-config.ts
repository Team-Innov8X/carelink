/** Enable with NEXT_PUBLIC_DEMO_MODE=true when preparing the guided demo. */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
export const DEMO_FEATURES = [
  'dashboard',
  'triage',
  'requests',
  'driver-request',
  'hospitals',
  'history',
] as const;

export function isDemoFeatureVisible(featureId: string) {
  return !DEMO_MODE || DEMO_FEATURES.includes(featureId as (typeof DEMO_FEATURES)[number]);
}
