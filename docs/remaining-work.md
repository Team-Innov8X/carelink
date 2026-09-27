# Emergency Resource Allocator — Remaining Work

Updated 2026-09-27 after reviewing the supplied allocator skill and API reference.

## Phase 1 status

- [x] MongoDB collections and indexes: GeoJSON 2dsphere, resource lookups, pending-hold uniqueness, expiry lookup, and terminal-hold retention.
- [x] Pending holds expire through the application expiry worker so inventory is released before a hold is deleted. Terminal records use a 90-day TTL. A TTL directly on pending hold creation time is unsafe because Mongo TTL deletion cannot release `heldQuantity` or perform escalation.
- [x] Shared role definitions and server-side signup role validation; admin is not self-assignable.
- [x] Hospital staff accounts resolve to their linked hospital by ID or their registered hospital name, so signup accounts can use the scoped inbox, resources, holds, and event stream.
- [x] Shared API error helpers, Zod input schemas, and role guards are used by allocator routes.
- [x] Ranking stays isolated and scores resource match, route/travel estimate, freshness, and hospital reliability; results include the component breakdown and only include hospitals with a matching resource.
- [x] Hospital/resource list, detail, update, rank, role, hold, confirm, reject, cancel, and status polling routes.
- [x] Hold creation is an atomic resource capacity reservation; confirmation and release update the hold and inventory in Mongo transactions.
- [x] Rejection and expiry release inventory and create a pending hold at the next ranked hospital when capacity exists.
- [x] Change Streams endpoint and expiry processing heartbeat; hospital staff sessions are supported.
- [x] Safe, repeatable demo seed and stale/low-capacity seed variants; neither clears user data.
- [x] Mongo-backed verification variant exercises simultaneous last-bed requests, confirmation accounting, rejection escalation, and timeout escalation, then removes its temporary records.
- [x] Ranking unit tests cover matching, freshness, breakdown, top-three cap, and GeoJSON coordinate order.

## Remaining operational work

- [ ] Configure a recurring expiry trigger in production if dashboards/SSE clients may be offline for longer than a hold timeout. Current expiry processing runs on allocator reads/ranking and while hospital SSE clients are connected; MongoDB TTL cannot safely replace the inventory-release worker.
- [ ] Verify Google Maps Routes API credentials and enabled API in the deployment environment. Ranking intentionally falls back to a straight-line ETA if the Routes API is unavailable.
- [ ] Pharmacy request/stock confirmation routes from the Phase 2 reference are not present; medication fulfillment must retain pharmacist approval.

## Verification commands

```sh
npm run build
npm run lint
npm test
```

In development, `POST /api/seed` with `{ "variant": "demo" }` upserts the demo records. Use `{ "variant": "stale-low" }` to add stale/low-capacity data, or `{ "variant": "verify" }` to run the temporary MongoDB reservation scenarios. Production seed requests require an admin session.
