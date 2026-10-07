# CareLink technical approach tree

CareLink is a role-based emergency coordination web app. This tree describes the current implementation and the practical path through its major layers and workflows.

```text
CareLink
├── 1. User experience — Next.js 16 App Router + React 19 + TypeScript
│   ├── app/ — route entry points, shared layout, API handlers
│   │   ├── signin/ and signup/ — account access and role-specific onboarding
│   │   ├── dispatcher/ — create and coordinate emergency requests
│   │   ├── patient-dashboard/ — patient status and SOS
│   │   ├── driver-dashboard/ — availability, SOS offers, arrival/completion
│   │   ├── hospital-admin/ — hospital operations
│   │   └── pharmacy-dashboard/ — medicine stock and orders
│   ├── App.tsx + components/ — dashboards, maps, handoff, notifications,
│   │   └── hospital directory, capacity, pharmacy, and shared navigation
│   └── context/CareLinkContext.tsx — client state and UI actions
│       ├── Start with built-in sample data
│       ├── Restore browser localStorage copy
│       └── Reconcile with /api/data; remain usable if MongoDB is unavailable
├── 2. API and access control — app/api/**/route.ts
│   ├── Better Auth session — lib/auth.ts, lib/auth-client.ts
│   ├── Shared role checks — lib/roles.ts, lib/role-route.ts
│   ├── Input validation and consistent responses — lib/validation.ts,
│   │   └── lib/api-response.ts
│   ├── Emergency and dispatch — /api/sos, /api/sos/[id]/**,
│   │   └── /api/sos/available, /api/sos/nearby
│   ├── Hospital operations — /api/hospitals/**, /api/hospital-requests/**
│   ├── Resource reservations — /api/holds/**
│   ├── Coordination — /api/notifications/**, /api/stream/hospitals
│   └── Supporting routes — auth, users, pharmacy-orders, rank, data, seed
├── 3. Domain services — lib/
│   ├── services/hold-service.ts — atomic reservation lifecycle,
│   │   └── release, timeout, and escalation
│   ├── ranking-engine.ts + ranking.ts — match resources, travel time,
│   │   └── data freshness, and hospital reliability
│   ├── sos.ts — SOS dispatch behavior
│   ├── google-maps.ts — optional route-time lookup; ranking can fall back
│   │   └── to straight-line estimate
│   └── validation.ts — Zod schemas at API boundaries
├── 4. Persistence — MongoDB
│   ├── lib/mongodb.ts — shared connection pool and reconnect handling
│   ├── lib/models/ — users, hospitals, resources, holds, indexes
│   ├── Collections — user, hospitals, resources, holds, plus operational
│   │   └── snapshot collections used by /api/data
│   ├── GeoJSON hospital points + 2dsphere index — proximity search
│   ├── Atomic capacity updates / transactions — prevent overbooking
│   └── Browser fallback — localStorage is local to one browser/device
├── 5. Main operating flows
│   ├── Emergency response
│   │   └── Patient SOS → available drivers → atomic driver acceptance →
│   │       equipment-matched nearby hospitals → arrival → completion
│   ├── Hospital resource allocation
│   │   └── Dispatcher ranks hospitals → pending hold reserves capacity →
│   │       hospital confirms/rejects → reject/expiry releases capacity and
│   │       escalates to next ranked hospital when possible
│   ├── Live coordination
│   │   └── Hospital change stream / SSE → connected dashboards refresh
│   └── Pharmacy
│       └── Search stock → create medicine order; stock/request approval
│           endpoints are a remaining gap (see docs/remaining-work.md)
└── 6. Delivery and operational requirements
    ├── Configure MONGODB_URI and BETTER_AUTH_SECRET
    ├── Configure Google Routes API credentials for route ETAs
    ├── Run/verify seed only against local or disposable databases
    ├── Schedule production hold expiry processing so offline clients do not
    │   └── delay release of reserved inventory
    └── Before release: npm run build, npm run lint, npm test
```

## Implementation priorities

1. **Protect capacity first.** Keep resource decrement/hold creation atomic, make confirm/reject/cancel/expiry transitions idempotent, and preserve an audit trail.
2. **Keep decisions explainable.** Return ranking score components and timestamp/freshness information so dispatchers can understand recommendations.
3. **Treat real-time delivery as an optimization.** Persist authoritative state in MongoDB; use SSE/change streams to update connected clients and refetch after reconnect.
4. **Keep offline behavior explicit.** Browser storage is a usability fallback, not shared or authoritative operational state.
5. **Close the operational gaps before production.** Schedule hold expiry processing and complete pharmacist-approved stock/request workflows; verify route API credentials and deployment secrets.

## Current scope notes

- The SOS driver flow is authenticated and acceptance is atomic; drivers poll for available work rather than receiving push notifications.
- Hospital recommendation uses resource match, estimated travel, freshness, and reliability. Google Routes API is optional and the app can use a straight-line estimate.
- Allocator implementation details and verification status are tracked in [remaining-work.md](remaining-work.md).
