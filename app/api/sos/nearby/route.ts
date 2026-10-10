import { requireRole } from "@/lib/auth-utils";
import { distanceKm, sosCollections, validCoordinates } from "@/lib/sos";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireRole("patient");
  if (!auth.authorized || !auth.user) {
    return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  }

  const url = new URL(request.url);
  const latitude = url.searchParams.get("latitude");
  const longitude = url.searchParams.get("longitude");
  const origin = latitude !== null && longitude !== null
    ? { latitude: Number(latitude), longitude: Number(longitude) }
    : null;
  if (!validCoordinates(origin)) {
    return Response.json({ error: "Provide valid latitude and longitude coordinates" }, { status: 400 });
  }

  const { drivers } = await sosCollections();

  const availableDrivers = await drivers.find({ available: true, location: { $exists: true } }).toArray();
  const nearby = availableDrivers
    .filter((driver) => validCoordinates(driver.location))
    .map((driver) => ({ location: driver.location, distanceKm: distanceKm(origin, driver.location!) }))
    .filter((driver) => driver.distanceKm <= 50)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 30)
    .map((driver, index) => ({ id: `driver-${index + 1}`, location: driver.location, distanceKm: Number(driver.distanceKm.toFixed(1)) }));

  return Response.json({
    patientLocation: origin,
    patient: { name: auth.user.name, email: auth.user.email ?? null, phone: (auth.user as { phone?: string }).phone ?? null },
    drivers: nearby,
    radiusKm: 50,
  });
}
