This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## SOS dispatch API

All SOS endpoints require an authenticated session. Patient requests are visible to logged-in ambulance drivers who have registered themselves as available. Drivers poll for new work with `GET /api/sos/available`; acceptance is atomic, so only one driver can claim a request. The driver then receives the patient's coordinates and a Google Maps directions URL. After accepting, the driver can retrieve equipment-matched hospitals ordered by distance.

### Endpoints

- `POST /api/sos` (patient): `{ "location": { "latitude": 12.97, "longitude": 77.59 }, "incidentType": "cardiac emergency", "requiredEquipment": ["defibrillator"] }`
- `GET /api/sos/available` (ambulance driver): list active SOS offers and distance from the driver's last known location.
- `PATCH /api/sos/available` (ambulance driver): `{ "available": true, "location": { "latitude": 12.98, "longitude": 77.60 } }` to register availability and update location. Send `available: false` to go offline.
- `POST /api/sos/:id/accept` (ambulance driver): accepts an offer; optional `{ "location": { ... } }` refreshes the driver's location. Response includes patient coordinates and `directionsUrl`.
- `GET /api/sos/:id` (patient or assigned driver): request status.
- `GET /api/sos/:id/hospitals?limit=5` (assigned driver): nearest hospitals whose `equipment` includes every requested item; response includes distances and map directions.

The MongoDB `drivers` collection stores `{ userId, available, location }`. Add hospitals to the `hospitals` collection as `{ name, address, location: { latitude, longitude }, equipment: ["defibrillator", "ventilator"] }`. Equipment matching ignores letter case. The driver app should poll `GET /api/sos/available` (for example, every few seconds while on duty); this implementation does not send push notifications. Hospital records and equipment inventory must be kept current by the hospital onboarding/admin flow.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
