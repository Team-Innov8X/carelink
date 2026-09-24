# CareLink

CareLink is an emergency coordination dashboard for dispatch, hospital capacity, patient handoff, and pharmacy stock.

## Run locally

1. Install dependencies with `npm install`.
2. Start a MongoDB instance and copy `.env.example` to `.env.local`.
3. Set `MONGODB_URI` to your MongoDB connection string and replace `BETTER_AUTH_SECRET` with a random secret.
4. Run `npm run dev` and open [http://localhost:3000](http://localhost:3000).

### Maps

The dashboard uses Leaflet with OpenStreetMap tiles. No Google Maps key or Google Maps API is required. Hospital ETAs and recommendations currently use the operational data stored by CareLink; the dashed handoff line on the map connects the selected ambulance and hospital.

On first load, the app initializes its operational snapshot from the built-in sample data. Hospital capacity, emergency requests, pharmacy inventory, ambulance state, and medicine orders then sync between clients. If MongoDB is unavailable, the UI uses browser storage; those changes will not be shared with other devices.

Email/password sign-in uses Better Auth and the same MongoDB connection. Create staff accounts through the Better Auth sign-up API or provision them administratively. Google sign-in is available only when its client ID and secret are configured.

## Useful commands

- `npm run dev` — development server
- `npm run build` — production build
- `npm start` — serve the production build
- `npm run lint` — run ESLint
