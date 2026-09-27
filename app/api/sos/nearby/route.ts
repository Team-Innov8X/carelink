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

  // Stable local demo data around Connaught Place (Central Delhi).
  // Never use these synthetic drivers outside local development.
  if (process.env.NODE_ENV === "development") {
    const testDrivers = [
      { id: "demo-driver-1", name: "Aarav Mehta", latitude: 28.6352, longitude: 77.2168 },
      { id: "demo-driver-2", name: "Priya Kapoor", latitude: 28.6307, longitude: 77.2224 },
      { id: "demo-driver-3", name: "Rohan Verma", latitude: 28.6279, longitude: 77.2161 },
      { id: "demo-driver-4", name: "Neha Singh", latitude: 28.6371, longitude: 77.2241 },
      { id: "demo-driver-5", name: "Kabir Sharma", latitude: 28.6258, longitude: 77.2229 },
    ];
    const demoOrigin = { latitude: 28.6328, longitude: 77.2195 };
    const nearby = testDrivers.map((driver) => {
      const location = { latitude: driver.latitude, longitude: driver.longitude };
      return {
        id: driver.id,
        name: driver.name,
        location,
        distanceKm: Number(distanceKm(demoOrigin, location).toFixed(1)),
      };
    });

    return Response.json({
      patientLocation: demoOrigin,
      patient: { name: auth.user.name, email: auth.user.email ?? null, phone: (auth.user as { phone?: string }).phone ?? null },
      drivers: nearby,
      radiusKm: 50,
      demo: true,
      area: "Connaught Place, New Delhi",
    });
  }

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
