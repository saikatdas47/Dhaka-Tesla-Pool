# Dhaka Tesla Pool — current MongoDB data model

This documents the **eight Mongoose collections currently used**, not the archived six-collection proposal. See [data-model.eraserdiagram](./data-model.eraserdiagram) for an Eraser.io ERD and [PROJECT_DESIGN.md](./PROJECT_DESIGN.md) for behavior. `ObjectId` references are logical application relationships, not MongoDB-enforced foreign keys.

| Collection | Owns | References and lifetime |
| --- | --- | --- |
| `Passenger` | Identity, role-local unique email/username, phone, password/refresh-token hashes, verification and photo metadata | One Passenger can have many RideRequests and reviews. No ride history array is embedded in the account. |
| `Driver` | Identity, unique email/username/licence/registration, vehicle and 2–4-seat capacity, approval history, usual/current area and availability | One Driver can have many Pools and reviews. The vehicle is embedded because the MVP supports one vehicle per Driver. |
| `RideRequest` | One Passenger's route, seats, solo/pooled/final fare in integer paisa, applied fare-rule snapshot, payment, status and timestamped history | Required `passenger → Passenger`; optional `pool → Pool`. Completed/cancelled records are retained for history. |
| `Pool` | One Driver's trip, vehicle/Driver snapshot, seat inventory, bounded embedded members, status and events | Required `driver → Driver`; each member embeds `request → RideRequest` and `passenger → Passenger` with assignment snapshots. |
| `FareSettings` | The current Admin-selected base fare, per-km rate and shared-discount percent | Singleton `_id: "current"`; no RideRequest FK. Applied numbers are copied into each RideRequest. |
| `EmailOtp` | Registration OTP/token hashes, role/email, attempts and expiry | Temporary pre-account record: no account ObjectId exists yet. Unique `(role,email)` and TTL expiry. |
| `RideChat` | One matched request's private messages and expiry | Unique `ride → RideRequest`, plus `pool → Pool`, `passenger → Passenger`, `driver → Driver`. Deleted at arrival/cancellation; TTL is a fallback. |
| `DriverReview` | One completed ride's integer rating 1–5, comment, Passenger name snapshot and timestamps | Unique `ride → RideRequest`, plus `passenger → Passenger` and `driver → Driver`. Persistent. |

## Important invariants

- Passenger and Driver credentials are unique **within their own collections**, not globally across both roles. Admin has no collection; its credentials are environment-configured.
- A partial unique index permits one active RideRequest per Passenger and one active Pool per Driver. Offers are indexed by pickup area/status/time. Pool membership and occupied seats are updated with a capacity condition inside a transaction.
- `RideRequest.pool` and `Pool.members[]` represent the same assignment while active. A cancelled request can retain its historical pool link even after removal from current members.
- Names, vehicle, route and fare rates are snapshotted on ride records. Later profile or Admin-rate edits must not change old history. `FareSettings` is mutable today; the archived `FarePolicy` versioning design is **not implemented**.
- Passenger History queries are scoped to the authenticated Passenger. Driver reviews expose Passenger names, not IDs/contact details or unrelated ride history. OTP hashes, token hashes and photo public IDs are never public response fields.
- Chat is temporary; review and completed/cancelled ride history are persistent. No separate collection is needed just for History or PoolMember in a 2–4-seat MVP.
