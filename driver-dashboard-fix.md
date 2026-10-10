# CareLink Driver Dashboard: Fix and Feature Spec (Next.js + MongoDB + Tailwind + Better Auth)

Hand this file to your coding assistant together with your repo. It covers the errors visible in the current dashboard, their root causes, and every driver-side feature from the requirements, written for this stack.

**Assumptions** (change them if wrong):
- Next.js **App Router** (`app/` directory), TypeScript, Route Handlers (`app/api/**/route.ts`).
- MongoDB (Atlas or a local **replica set**; plain standalone Mongo is fine too, but change streams need a replica set).
- Tailwind CSS for styling.
- Better Auth with the MongoDB adapter.
- Real-time uses **Server-Sent Events (SSE)** by default. If you deploy on Vercel or any serverless host, see section 5 for the hosted alternative, because in-memory SSE and `setTimeout` do not survive there.

---

## 0. What the screenshot shows is broken

| # | Symptom on screen | Likely cause in this stack | Fix section |
|---|---|---|---|
| 1 | "Couldn't load requests. Retry." | `fetch("/api/driver/...")` returns 401/404/500: no route handler, session not read, or Mongo connection failing | 3, 4.1 |
| 2 | "Driver · Ambulance not linked" | No `ambulances` document with `driverId` = session user id, or the profile route is missing | 4.2 |
| 3 | Stuck on "Offline"; "Go available" does nothing | Button not calling `POST /api/driver/status` or not persisting `isOnline` | 4.3 |
| 4 | "No open SOS requests" shown with the error | Empty state rendered when the fetch failed | 7.1 |
| 5 | Trip map is an empty placeholder | Map only mounted when a request is open; Leaflet needs a client-only dynamic import | 6 |
| 6 | Only "Dashboard" and "Trip history" tabs | Missing **Normal requests** tab | 4.6 |
| 7 | Header clipped at the top | Layout/scroll container or sticky header overlap | 7.2 |

First step: open DevTools, Network tab, click **Retry**, and note the status code of the failing request.
- `401` -> session/cookie problem (section 2).
- `404` -> route handler missing or wrong path.
- `500` -> look at the terminal running `next dev`; usually the Mongo URI or a null session.
- CORS error -> you are calling a different origin; use relative URLs (`/api/...`) from the Next.js app.

---

## 1. Project structure

```
src/
  lib/
    auth.ts               # Better Auth server instance
    auth-client.ts        # Better Auth React client
    mongodb.ts            # shared MongoClient + db helper
    events.ts             # SSE event bus (section 5)
    geo.ts                # distance, scoring helpers
  middleware.ts           # route protection by role
  app/
    api/
      auth/[...all]/route.ts
      driver/
        me/route.ts
        status/route.ts
        location/route.ts
        sos/open/route.ts
        sos/[id]/accept/route.ts
        sos/[id]/reject/route.ts
        sos/[id]/choose-hospital/route.ts
        sos/[id]/onboard/route.ts
        sos/[id]/complete/route.ts
        normal-requests/route.ts
        normal-requests/[id]/accept/route.ts
        normal-requests/[id]/reject/route.ts
        trips/route.ts
      patient/sos/route.ts                # creates SOS and dispatches
      hospitals/nearby/route.ts
      places/route.ts                     # Overpass proxy (hospitals + pharmacies)
      recommend-hospital/route.ts
      notifications/route.ts
      notifications/read-all/route.ts
      stream/route.ts                     # SSE endpoint
      stats/route.ts
    driver/
      layout.tsx
      page.tsx                            # dashboard
  components/driver/
    DriverDashboard.tsx
    SosAlertModal.tsx
    StatusToggle.tsx
    TripMap.tsx                           # client only, dynamic import
    NormalRequestsTab.tsx
    TripHistory.tsx
    HospitalPicker.tsx
    NotificationBell.tsx
```

---

## 2. Better Auth setup (fixes 401 errors and role handling)

### 2.1 `src/lib/mongodb.ts`

```ts
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI!;
declare global { var _mongo: Promise<MongoClient> | undefined }

const client = global._mongo ?? new MongoClient(uri).connect();
if (process.env.NODE_ENV !== "production") global._mongo = client;

export async function getDb() {
  return (await client).db(process.env.MONGODB_DB ?? "carelink");
}
```

### 2.2 `src/lib/auth.ts`

```ts
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { nextCookies } from "better-auth/next-js";
import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI!);
const db = client.db(process.env.MONGODB_DB ?? "carelink");

export const auth = betterAuth({
  database: mongodbAdapter(db),
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      role: { type: "string", required: true, defaultValue: "patient", input: true }, // patient | driver | hospital
      phone: { type: "string", required: false },
    },
  },
  plugins: [nextCookies()], // must be last
});
```

`.env.local`:

```
MONGODB_URI=...
MONGODB_DB=carelink
BETTER_AUTH_SECRET=<long random string>
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
AI_API_KEY=...            # server only, never NEXT_PUBLIC_
```

`src/app/api/auth/[...all]/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
export const { GET, POST } = toNextJsHandler(auth);
```

### 2.3 Session helper used by every driver route

```ts
// src/lib/session.ts
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function requireRole(role: "driver" | "patient" | "hospital") {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: Response.json({ error: "unauthenticated" }, { status: 401 }) };
  if ((session.user as any).role !== role)
    return { error: Response.json({ error: "forbidden" }, { status: 403 }) };
  return { user: session.user };
}
```

Use it at the top of each handler:

```ts
const { user, error } = await requireRole("driver");
if (error) return error;
```

### 2.4 Middleware (redirect instead of showing a broken page)

```ts
// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function middleware(req: NextRequest) {
  const cookie = getSessionCookie(req);
  if (!cookie && req.nextUrl.pathname.startsWith("/driver"))
    return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}
export const config = { matcher: ["/driver/:path*", "/hospital/:path*", "/patient/:path*"] };
```

The middleware only checks that a cookie exists. The role is still verified in the route handlers and the page layout.

Client side, on any `401` from `fetch`, redirect to `/login` instead of showing "Couldn't load requests".

---

## 3. MongoDB collections and indexes

```
drivers        { _id, userId, name, phone, isOnline, location:{type:"Point",coordinates:[lng,lat]}, lastSeenAt, ambulanceId }
ambulances     { _id, driverId, plateNo, type }
sosRequests    { _id, patientId, patientName, phone, location:{type:"Point",coordinates:[lng,lat]}, details, severity,
                 status: "pending"|"accepted"|"expired"|"onboard"|"completed"|"cancelled",
                 acceptedByDriverId, recommendedHospitalId, chosenHospitalId, createdAt, expiresAt }
sosDispatches  { _id, sosId, driverId, status: "sent"|"accepted"|"rejected"|"expired", sentAt, respondedAt }
normalRequests { _id, patientId, patientName, phone, pickup:{type:"Point",coordinates:[lng,lat]}, hospitalId?, details,
                 status: "pending"|"accepted"|"rejected"|"completed", driverId, createdAt }
bedRequests    { _id, hospitalId, patientId, sosId?, status: "pending"|"accepted"|"rejected"|"expired", createdAt, expiresAt }
hospitals      { _id, name, location:{type:"Point",coordinates:[lng,lat]}, phone, totalBeds, availableBeds, specialties[], registered }
notifications  { _id, userId, role, type, title, body, read, createdAt, expiresAt }
```

Note that `user`, `session`, and `account` collections are created by Better Auth. Link `drivers.userId` to the Better Auth user id.

Create indexes once (script `scripts/ensure-indexes.ts`, run at startup or manually):

```ts
await db.collection("drivers").createIndex({ location: "2dsphere" });
await db.collection("drivers").createIndex({ isOnline: 1, lastSeenAt: -1 });
await db.collection("hospitals").createIndex({ location: "2dsphere" });
await db.collection("sosRequests").createIndex({ status: 1, expiresAt: 1 });
await db.collection("sosDispatches").createIndex({ driverId: 1, status: 1 });
await db.collection("bedRequests").createIndex({ hospitalId: 1, status: 1, expiresAt: 1 });
// auto-delete notifications 24h after creation (expiresAt = createdAt + 24h)
await db.collection("notifications").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// one pending bed request per patient per hospital (enforces the "no second request" rule)
await db.collection("bedRequests").createIndex(
  { patientId: 1, hospitalId: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);
```

The last index makes the "patient can't send another request to the same hospital while one is pending" rule hold even under double clicks. Catch the duplicate key error (code `11000`) and return `409`.

---

## 4. Driver features and fixes

### 4.1 Fix "Couldn't load requests"

`GET /api/driver/sos/open` must:
1. Require a driver session.
2. Return `[]` with status `200` when there are no requests.
3. Return only dispatches where `driverId` is this driver, `status = "sent"` and `expiresAt > now`.

```ts
// app/api/driver/sos/open/route.ts
import { getDb } from "@/lib/mongodb";
import { requireRole } from "@/lib/session";
import { ObjectId } from "mongodb";

export async function GET() {
  const { user, error } = await requireRole("driver");
  if (error) return error;
  const db = await getDb();
  const driver = await db.collection("drivers").findOne({ userId: user.id });
  if (!driver) return Response.json([]);
  const dispatches = await db.collection("sosDispatches")
    .find({ driverId: driver._id, status: "sent" }).toArray();
  const sos = await db.collection("sosRequests").find({
    _id: { $in: dispatches.map(d => d.sosId) },
    status: "pending",
    expiresAt: { $gt: new Date() },
  }).toArray();
  return Response.json(sos);
}
```

In the component, use a small fetch helper that throws on non-OK and distinguishes 401 from other failures (see 7.1).

### 4.2 Fix "Ambulance not linked"

- `GET /api/driver/me` returns `{ driver, ambulance, isOnline }`. Create the `drivers` document automatically the first time a user with `role = "driver"` opens the dashboard (upsert on `userId`).
- If `ambulance` is `null`, show an inline form (plate number, type) that calls `POST /api/driver/ambulance`, inserts into `ambulances`, and sets `drivers.ambulanceId`.
- Disable "Go available" until an ambulance is linked, with the text "Link your ambulance first".
- Replace the generic label with `"{driver.name} · {ambulance.plateNo}"`.

### 4.3 Online / offline toggle

`POST /api/driver/status { isOnline }` updates `drivers.isOnline` and `lastSeenAt`.

```tsx
// components/driver/StatusToggle.tsx
"use client";
import { useState } from "react";

export function StatusToggle({ online, canGoOnline, onChange }:{
  online: boolean; canGoOnline: boolean; onChange: (v: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch("/api/driver/status", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOnline: !online }),
      });
      if (!res.ok) throw new Error();
      onChange(!online);
    } finally { setBusy(false); }
  }
  return (
    <div className="flex items-center gap-3">
      <span className={`rounded-full px-3 py-1 text-sm font-medium ${
        online ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
        {online ? "Available" : "Offline"}
      </span>
      <button onClick={toggle} disabled={busy || !canGoOnline}
        className={`rounded-xl px-5 py-3 font-semibold text-white disabled:opacity-50 ${
          online ? "bg-emerald-600" : "bg-slate-900"}`}>
        {busy ? "Please wait..." : online ? "Go offline" : "Go available"}
      </button>
    </div>
  );
}
```

- On page load, take the initial state from `/api/driver/me`.
- Offline drivers are never selected for SOS dispatch (4.5), and their SSE connection is closed.
- If a driver's `lastSeenAt` is older than 30 s, treat them as offline when dispatching (covers closed tabs).

### 4.4 Live GPS

```tsx
useEffect(() => {
  if (!online) return;
  const id = navigator.geolocation.watchPosition(
    (pos) => {
      setMyPos([pos.coords.latitude, pos.coords.longitude]);
      throttledSend(pos.coords.latitude, pos.coords.longitude); // every 3-5 s
    },
    () => setGeoDenied(true),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
  );
  return () => navigator.geolocation.clearWatch(id);
}, [online]);
```

`POST /api/driver/location` stores the point in `drivers.location` and `lastSeenAt`, and, if the driver has an active trip, publishes a `sos:status` event to the patient with the new location.

Geolocation only works on **HTTPS or localhost**. If testing on a phone over LAN, use an HTTPS tunnel (ngrok, Cloudflare Tunnel) or `next dev --experimental-https`.

### 4.5 SOS dispatch (10 second window, all online drivers at once)

`POST /api/patient/sos` (patient side) does the dispatching:

```ts
const now = new Date();
const expiresAt = new Date(now.getTime() + 10_000);
const sos = await db.collection("sosRequests").insertOne({
  patientId, patientName, phone, location, details, severity,
  status: "pending", createdAt: now, expiresAt,
});

const onlineDrivers = await db.collection("drivers").find({
  isOnline: true,
  lastSeenAt: { $gt: new Date(Date.now() - 30_000) },
}).toArray();

await db.collection("sosDispatches").insertMany(
  onlineDrivers.map(d => ({ sosId: sos.insertedId, driverId: d._id, status: "sent", sentAt: now }))
);
onlineDrivers.forEach(d => publish(`driver:${d.userId}`, { type: "sos:new", sos: { ...payload, expiresAt } }));
```

**Accept must be atomic** so only one driver wins:

```ts
// app/api/driver/sos/[id]/accept/route.ts
const res = await db.collection("sosRequests").findOneAndUpdate(
  { _id: new ObjectId(id), status: "pending", expiresAt: { $gt: new Date() } },
  { $set: { status: "accepted", acceptedByDriverId: driver._id } },
  { returnDocument: "after" }
);
if (!res) return Response.json({ error: "taken_or_expired" }, { status: 409 });

await db.collection("sosDispatches").updateOne({ sosId: res._id, driverId: driver._id }, { $set: { status: "accepted", respondedAt: new Date() } });
await db.collection("sosDispatches").updateMany({ sosId: res._id, driverId: { $ne: driver._id } }, { $set: { status: "expired" } });
publishToDrivers(otherDriverUserIds, { type: "sos:taken", sosId: id });
publish(`user:${res.patientId}`, { type: "sos:status", status: "accepted", driver: {...}, ambulance: {...} });
await notify(res.patientId, "Driver on the way", "...");
```

**Expiry without relying on `setTimeout`** (works on serverless too):
1. **Lazy expiry**: every read (`/sos/open`, accept, patient status) treats `status = "pending" && expiresAt < now` as expired. Accept already filters by `expiresAt > now`.
2. **Sweeper**: one job that runs every few seconds and marks overdue SOS requests `expired`, expires their dispatches, and publishes `sos:expired` to the patient and drivers.
   - Self-hosted Node: start it once in `instrumentation.ts` with `setInterval`.
   - Vercel: use Vercel Cron for a coarse sweep (minute level) plus the lazy checks above, because the 10 s UI countdown is driven by `expiresAt`, not by the server timer.

```ts
// src/instrumentation.ts (self-hosted)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSweeper } = await import("./lib/sweeper");
    startSweeper(); // setInterval(sweepSos + sweepBeds, 2000)
  }
}
```

**Frontend modal** (`SosAlertModal.tsx`):
- Open on SSE `sos:new` and on initial fetch of `/api/driver/sos/open`.
- Countdown computed from the server `expiresAt`: `Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))`, updated every 250 ms.
- Accept and Reject buttons; at 0 the modal closes by itself.
- Close immediately on `sos:taken` / `sos:expired`.
- Siren: `new Audio("/siren.mp3")` with `loop = true`; unlock audio on the first click of "Go available" because browsers block autoplay otherwise.
- Queue multiple alerts and show one at a time.

Tailwind sketch:

```tsx
<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
  <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-4 ring-red-500/60 animate-pulse-slow">
    <p className="text-sm font-semibold uppercase tracking-wide text-red-600">Emergency SOS</p>
    <h2 className="mt-1 text-2xl font-bold">{sos.patientName}</h2>
    <p className="mt-1 text-slate-600">{distanceKm} km away · {sos.severity}</p>
    <div className="my-5 grid h-20 w-20 place-items-center rounded-full border-4 border-red-500 text-3xl font-bold">{secondsLeft}</div>
    <div className="grid grid-cols-2 gap-3">
      <button className="rounded-xl bg-slate-100 py-3 font-semibold">Reject</button>
      <button className="rounded-xl bg-red-600 py-3 font-semibold text-white">Accept</button>
    </div>
  </div>
</div>
```

### 4.6 Normal requests tab

- Tabs become **Dashboard | Normal requests | Trip history**, each with a count badge.
- `GET /api/driver/normal-requests` returns pending requests, newest first, optionally near the driver using `$near` on `pickup`.
- Accept uses `findOneAndUpdate({ _id, status: "pending" }, { $set: { status: "accepted", driverId } })`, so two drivers cannot take the same request (return `409` to the loser).
- Real-time `normal:new` adds a card; `normal:taken` removes it.
- No countdown here: it is the driver's choice.
- Accept or reject immediately creates a notification for the patient and publishes `request:update`.
- If `hospitalId` is present, the map routes straight to that hospital; otherwise the driver gets the picker (4.8).

### 4.7 After accepting an emergency request

- Map shows the driver marker, patient marker, and the **route driver -> patient**.
- Trip stepper: `Accepted -> Reached patient -> Onboard -> At hospital -> Completed`, each step a `POST` that updates `sosRequests.status` and publishes `sos:status` to the patient.
- On **Onboard**, the map automatically switches the route to **patient location -> chosen/recommended hospital**.
- Patient's emergency tab updates immediately from the `sos:status` events (driver name, phone, ETA, live location).

### 4.8 Hospital selection and bed request

- `GET /api/hospitals/nearby?lat&lng` uses `$near` on the `hospitals.location` 2dsphere index and returns distance and `availableBeds`.
- `POST /api/recommend-hospital` returns a ranked list. Start with this scoring function (replace later with a trained ML model behind the same endpoint):

```ts
score = 0.40 * (1 - distance / maxDistance)
      + 0.25 * (availableBeds > 0 ? Math.min(availableBeds / 5, 1) : 0)
      + 0.25 * specialtyMatch(condition, hospital.specialties)
      + 0.10 * hospital.acceptRate
```

- The top hospital is pre-selected as **Recommended**.
- When the driver confirms, `POST /api/driver/sos/:id/choose-hospital` inserts a `bedRequests` row (`expiresAt = now + 5 min`) and notifies the hospital via SSE and a notification.
- The driver sees the bed state live: **Waiting / Accepted / Rejected / Expired**. On rejected or expired, open the picker again with the next-best hospital.

### 4.9 Calling

```tsx
<a href={`tel:${patient.phone}`} className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white">Call patient</a>
<a href={`tel:${hospital.phone}`} className="rounded-xl bg-sky-600 px-4 py-2 font-semibold text-white">Call hospital</a>
```

On a phone this opens the dialer. For the laptop-to-phone demo, use the "Find my phone"-style link you described so that clicking triggers the call on the mobile. Hide a button if the number is missing.

### 4.10 Trip history

`GET /api/driver/trips?page=1`: completed `sosRequests` and `normalRequests` for this driver, newest first, with an empty state "No trips yet" that is separate from the error state.

### 4.11 Driver notifications

- Bell with unread badge, list from `GET /api/notifications`.
- **Mark all as read**: `POST /api/notifications/read-all` runs `updateMany({ userId, read: false }, { $set: { read: true } })`.
- Auto-delete after 24 h comes from the TTL index in section 3 (`expiresAt = createdAt + 24h`). MongoDB's TTL monitor runs about once a minute, so also filter `expiresAt > now` in the query so expired ones never show.

```ts
export async function notify(userId: string, title: string, body: string, type = "info") {
  const db = await getDb();
  const now = new Date();
  await db.collection("notifications").insertOne({
    userId, type, title, body, read: false,
    createdAt: now, expiresAt: new Date(now.getTime() + 24 * 3600 * 1000),
  });
  publish(`user:${userId}`, { type: "notification:new", title, body });
}
```

---

## 5. Real-time delivery

### 5.1 SSE (self-hosted Node, simplest)

```ts
// src/lib/events.ts
type Sub = (data: unknown) => void;
const subs = (globalThis as any).__subs ??= new Map<string, Set<Sub>>();

export function subscribe(channel: string, fn: Sub) {
  if (!subs.has(channel)) subs.set(channel, new Set());
  subs.get(channel)!.add(fn);
  return () => subs.get(channel)?.delete(fn);
}
export function publish(channel: string, data: unknown) {
  subs.get(channel)?.forEach(fn => fn(data));
}
```

```ts
// app/api/stream/route.ts
import { requireRole } from "@/lib/session";
import { subscribe } from "@/lib/events";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return new Response("unauthorized", { status: 401 });
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(ctrl) {
      const send = (d: unknown) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(d)}\n\n`));
      const un1 = subscribe(`user:${session.user.id}`, send);
      const un2 = subscribe(`driver:${session.user.id}`, send);
      const ping = setInterval(() => ctrl.enqueue(enc.encode(": ping\n\n")), 20000);
      req.signal.addEventListener("abort", () => { un1(); un2(); clearInterval(ping); ctrl.close(); });
    },
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
```

Client: `const es = new EventSource("/api/stream");` with `onmessage` dispatching on `type`. `EventSource` reconnects by itself; after a reconnect, refetch `/api/driver/sos/open` so no alert is missed.

### 5.2 If you deploy on Vercel / serverless

An in-memory event bus does **not** work across serverless instances. Use one of:
- **Pusher / Ably / Supabase Realtime** (easiest): `publish()` calls their server SDK, the client subscribes to `private-user-{id}`.
- **Custom Node server** (`server.ts`) with Socket.IO, hosted on Railway, Render, Fly, or a VPS.
- **MongoDB change streams** feeding SSE (needs a replica set and a long-running Node process).

Keep the `publish(channel, event)` function signature so only its implementation changes.

### 5.3 Event list

| Event | To | Payload |
|---|---|---|
| `sos:new` | online drivers | sos, expiresAt |
| `sos:taken` | other drivers | sosId |
| `sos:expired` | drivers, patient | sosId |
| `sos:status` | patient | status, driver, ambulance, ETA, driver location |
| `normal:new` / `normal:taken` | drivers | request |
| `request:update` | patient | accepted / rejected |
| `bed:update` | driver, patient | status |
| `notification:new` | user | title, body |

---

## 6. Trip map (react-leaflet, client-only)

```bash
npm i leaflet react-leaflet
npm i -D @types/leaflet
```

```tsx
// components/driver/TripMapLoader.tsx
"use client";
import dynamic from "next/dynamic";
export const TripMap = dynamic(() => import("./TripMap"), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse rounded-2xl bg-slate-100" />,
});
```

Key points for `TripMap.tsx`:
- Import `"leaflet/dist/leaflet.css"` and fix the default marker icons (use custom `L.divIcon` or set icon URLs), otherwise markers show as broken images in Next.js.
- **Always mounted**, centered on the driver's GPS (with a "locating..." state until it arrives); not only when a request is open.
- Markers: driver (live), patient pickup, chosen hospital.
- Routes: OSRM public API (`https://router.project-osrm.org/route/v1/driving/{lng},{lat};{lng},{lat}?overview=full&geometries=geojson`) for demos; for production use your own OSRM, Mapbox, or Google Directions. Draw with `<Polyline>`.
- Route target: before onboard -> patient; after onboard -> hospital.
- **Hospitals and pharmacies around the driver, registered or not**: on `moveend` (debounced 600 ms), call your own `GET /api/places?south&west&north&east`, which proxies Overpass (avoids CORS, lets you cache and rate-limit). Registered CareLink hospitals come from MongoDB with a distinct icon (for example a green "CareLink" pin); the rest come from Overpass. De-duplicate by name and coordinates within about 50 m.
- Call `map.invalidateSize()` when switching tabs or resizing so tiles don't render blank.
- Recenter button and auto-follow toggle.

Overpass query used inside `/api/places`:

```
[out:json][timeout:25];
(
  node["amenity"~"hospital|pharmacy"](S,W,N,E);
  way["amenity"~"hospital|pharmacy"](S,W,N,E);
);
out center;
```

Cache responses per rounded bounding box for a few minutes (in-memory `Map` or `unstable_cache`) to stay within Overpass fair-use limits.

---

## 7. UI fixes (Tailwind)

### 7.1 Three separate states (loading / error / empty)

```tsx
{loading && <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />}

{!loading && error && (
  <div className="flex items-center justify-between rounded-2xl bg-red-50 px-4 py-3 text-red-700">
    <span>{error === "auth" ? "Session expired. Please log in again." : "Couldn't load requests."}</span>
    <button onClick={refetch} className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white">Retry</button>
  </div>
)}

{!loading && !error && !online && (
  <p className="rounded-2xl bg-slate-50 px-4 py-3 text-slate-600">Go available to receive SOS requests.</p>
)}

{!loading && !error && online && requests.length === 0 && (
  <p className="rounded-2xl bg-slate-50 px-4 py-3 text-slate-600">
    No open SOS requests. New calls will appear here and trigger an alert.
  </p>
)}
```

Fetch helper:

```ts
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (res.status === 401) { window.location.href = "/login"; throw new Error("auth"); }
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}
```

### 7.2 Layout

- Fix the clipped header: the dashboard wrapper needs top padding equal to the sticky header height (for example `pt-20`), or remove `h-screen overflow-hidden` from the parent so the page can scroll naturally.
- Desktop: two columns `grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6` (requests on the left, map on the right, map visible without scrolling). Mobile: single column, map below.
- Cards: `rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`.
- Tabs with count badges; active tab `bg-slate-900 text-white`, inactive `border border-slate-200`.
- Tap targets at least 44 px (`min-h-11`), text contrast AA, no horizontal scroll at 360 px.
- Header card shows `"{driver.name} · {ambulance.plateNo}"` instead of the generic "Driver".

### 7.3 Connection indicator

Small dot next to the status badge: green when the `EventSource` is open, amber while reconnecting (`readyState === 0`), red when closed. On reopen, refetch open SOS requests and normal requests.

---

## 8. Cross-role rules the driver flow depends on

- **Bed request lock**: unique partial index in section 3, returns `409` for a second pending request to the same hospital by the same patient.
- **Bed queue with one free bed**: request 1 is visible to the hospital for 5 minutes, then auto-rejected by the sweeper (`status: "expired"`, patient notified). Only after that does request 2 become visible. Implement as: hospital's `GET /requests` returns only the **oldest pending request per bed slot** while `availableBeds` is lower than the number of pending requests. When a bed is accepted, decrement `availableBeds` atomically with `findOneAndUpdate({ _id, availableBeds: { $gt: 0 } }, { $inc: { availableBeds: -1 } })`.
- **Hospital dashboard** loads requests from MongoDB; accept or reject sends a notification to patient and driver; patient history comes from a synthetic `patientHistory` collection created by the seed script.
- **Dynamic counters** from `GET /api/stats`: `hospitals.countDocuments()`, `drivers.countDocuments()`, `drivers.countDocuments({ isOnline: true, lastSeenAt: { $gt: now - 30s } })`.
- **AI assistant**: route handler `app/api/ai/route.ts` reads `process.env.AI_API_KEY` on the server only, uses a system prompt that restricts it to CareLink-related questions, and returns short suggestions.

---

## 9. Seed script (`scripts/seed.ts`)

Run with `npx tsx scripts/seed.ts`. It creates:
- 5 hospitals near your demo city (some with 1 free bed, varied specialties, `registered: true`).
- 3 drivers with ambulances (2 online with a recent `lastSeenAt`), created through Better Auth so logins work.
- 2 patients.
- 30 synthetic `patientHistory` records spread across hospitals.
- A few `normalRequests` and past trips.

---

## 10. Acceptance tests (driver dashboard)

1. Logged in as a driver with the backend running: no "Couldn't load requests"; empty state only when the list really is empty.
2. Logged out: any driver API returns `401` and the page redirects to `/login`.
3. Stop MongoDB or the server: error banner with Retry appears, with no empty state; Retry works after restart.
4. Click **Go available**: badge turns Available, `drivers.isOnline = true`, and `location` updates every few seconds in the database.
5. Patient presses SOS with two drivers online and one offline: both online drivers get the alert at the same moment; the offline driver gets none.
6. Nobody responds: the alert closes at 10 s on all screens and the patient sees "No driver available".
7. Driver A accepts: Driver B's alert closes right away and gets `409` if they click late; the patient's emergency tab shows driver details and live location.
8. Map shows the route driver -> patient; after **Onboard** it switches to patient -> hospital.
9. Driver picks a hospital: the hospital dashboard receives the bed request; its accept/reject reaches driver and patient as notifications.
10. A normal request appears only under **Normal requests**; accept and reject notify the patient.
11. A normal request that names a hospital routes directly to that hospital.
12. Map shows hospitals and pharmacies around the driver, including ones not registered on CareLink.
13. "Call patient" and "Call hospital" open the dialer with the correct number.
14. Notifications: **Mark all as read** works; documents older than 24 h are gone (TTL index plus query filter).
15. Mobile width (360 px): header not clipped, no horizontal scroll, map usable.

---

## 11. Suggested build order

1. `mongodb.ts`, Better Auth config, `requireRole`, middleware; confirm login works and `/api/driver/me` returns data (fixes the error banner and the ambulance link).
2. Ensure-indexes script and seed script.
3. Status toggle and location updates.
4. Event bus and `/api/stream` (or Pusher/Ably if on serverless).
5. SOS dispatch, atomic accept, lazy expiry plus sweeper, alert modal with countdown and siren.
6. Trip map: live location, routes, hospital and pharmacy layers.
7. Normal requests tab.
8. Hospital recommendation, bed request, bed states.
9. Notifications (bell, mark all read, TTL).
10. Calling buttons, trip history.
11. UI polish (layout, states, connection dot) and run through the acceptance tests.
