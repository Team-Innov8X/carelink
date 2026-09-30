# CareLink

CareLink is an emergency response coordination platform that connects patients, ambulance drivers, dispatchers, hospitals, and pharmacies. It supports emergency requests, hospital capacity and resource coordination, patient handoffs, and medicine orders.

## Features

- Role based dashboards for patients, ambulance drivers, dispatchers, hospital staff, and pharmacy teams.
- SOS requests with driver availability, atomic request acceptance, patient location sharing, and equipment matched hospital recommendations.
- Hospital directory, capacity and resource updates, reservation holds, and hospital request workflows.
- Patient handoff coordination, pharmacy inventory and orders, and notifications.
- Interactive maps with Leaflet and OpenStreetMap tiles.
- MongoDB persistence with browser storage fallback when MongoDB is unavailable.

## Requirements

- Node.js with npm
- MongoDB (local or hosted)

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and set the required values:

   ```dotenv
   MONGODB_URI=mongodb://localhost:27017/carelink
   BETTER_AUTH_SECRET=replace-with-a-long-random-secret
   BETTER_AUTH_URL=http://localhost:3000
   ```

   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are optional and enable Google sign-in. Use a long, random secret for `BETTER_AUTH_SECRET`. Keep `.env.local` private; it is ignored by Git.

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000), create an account, and choose the relevant role during sign-up.

On first load, CareLink initializes its operational snapshot from built-in sample data. With MongoDB configured and reachable, operational data is persisted and shared between clients. If MongoDB is unavailable, the UI falls back to browser storage; those changes are local to that browser.

## Available commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js development server. |
| `npm run build` | Build the production app. |
| `npm start` | Serve the production build. |
| `npm run lint` | Run ESLint. |
| `npm test` | Run the Node.js test suite. |

## Maps and recommendations

Maps use Leaflet with OpenStreetMap tiles; no Google Maps key is required for the map. When an ambulance accepts an SOS request, the response includes a Google Maps directions URL. Hospital recommendations match requested equipment and order eligible hospitals by distance using stored operational data.

## Database seed data

Sample hospital, resource, and hold records are maintained in `scripts/seed/seed-database.ts`. `POST /api/seed` runs the seed helper. Seeding clears the hospitals, resources, and holds collections before inserting sample records. Use this endpoint only with a local or disposable database.

## SOS dispatch API

SOS endpoints require an authenticated session. Patients create requests; authenticated drivers who have registered as available can view and accept them. Acceptance is atomic, so only one driver can claim a request. Drivers can then retrieve nearby hospitals equipped for the request.

| Method and endpoint | Purpose |
| --- | --- |
| `POST /api/sos` | Create a patient SOS request. |
| `GET /api/sos/available` | List available SOS offers for an on-duty driver. |
| `PATCH /api/sos/available` | Set driver availability and update location. |
| `POST /api/sos/:id/accept` | Accept an offer; response includes patient coordinates and a directions URL. |
| `GET /api/sos/:id` | Read request status as the patient or assigned driver. |
| `GET /api/sos/:id/hospitals?limit=5` | List nearby hospitals matching all equipment requested by the SOS. |

Example request body for `POST /api/sos`:

```json
{
  "location": { "latitude": 12.97, "longitude": 77.59 },
  "incidentType": "cardiac emergency",
  "requiredEquipment": ["defibrillator"]
}
```

To register an available driver, send `PATCH /api/sos/available` with a body such as:

```json
{
  "available": true,
  "location": { "latitude": 12.98, "longitude": 77.60 }
}
```

Send `available: false` to go offline. Driver clients should poll `GET /api/sos/available` while on duty; this implementation does not send push notifications. Hospital equipment data must be kept current for recommendations to be useful. Equipment matching ignores letter case.

## Project structure

- `app/` — Next.js pages, layouts, and API route handlers.
- `components/` — dashboards and reusable UI components organized by workflow.
- `context/`, `data/`, `lib/`, `types/`, `utils/` — application state, sample data, domain logic, types, and utilities.
- `scripts/seed/` — database seed helper.
- `test/` — Node.js tests.
