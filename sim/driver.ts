export {};

const baseUrl = process.env.SIM_DRIVER_BASE_URL ?? 'http://localhost:3000';
const cookie = process.env.SIM_DRIVER_COOKIE;
const parsedBase = new URL(baseUrl);
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

if (process.env.NODE_ENV === 'production') throw new Error('The driver simulator cannot run with NODE_ENV=production.');
if (!localHosts.has(parsedBase.hostname)) throw new Error('SIM_DRIVER_BASE_URL must point to localhost or 127.0.0.1.');
if (parsedBase.username || parsedBase.password) throw new Error('Do not put credentials in SIM_DRIVER_BASE_URL.');
if (!cookie?.trim()) throw new Error('Set SIM_DRIVER_COOKIE to the signed-in driver session cookie. The cookie value is never printed.');
const driverCookie = cookie.trim();

const startLat = Number(process.env.SIM_DRIVER_LAT ?? 28.6139);
const startLng = Number(process.env.SIM_DRIVER_LNG ?? 77.209);
const steps = Math.max(2, Number(process.env.SIM_DRIVER_STEPS ?? 60));
const intervalMs = Math.max(1000, Number(process.env.SIM_DRIVER_INTERVAL_MS ?? 5000));
if (![startLat, startLng, steps, intervalMs].every(Number.isFinite)) throw new Error('Simulator coordinates, steps, and interval must be valid numbers.');
async function main() {
  console.log(`Simulating ${steps} driver GPS points at ${parsedBase.origin}; stop with Ctrl+C.`);

  for (let step = 0; step < steps; step += 1) {
    const progress = step / (steps - 1);
    const location = {
      latitude: startLat + progress * 0.008,
      longitude: startLng + progress * 0.006 + Math.sin(progress * Math.PI * 2) * 0.001,
    };
    const response = await fetch(new URL('/api/driver/location', parsedBase), {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json', cookie: driverCookie, 'user-agent': 'carelink-dev-driver-simulator' },
      body: JSON.stringify({ location, accuracyM: 12, heading: 30, speed: 8 }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
      throw new Error(`Location ping rejected (${response.status}): ${payload.error ?? payload.message ?? 'check driver session and online/trip status'}`);
    }
    console.log(`Ping ${step + 1}/${steps}: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`);
    if (step + 1 < steps) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Driver simulation failed.');
  process.exitCode = 1;
});
