# Dhaka Tesla Pool — final MVP design

This document is the build contract for completing the **agreed MVP**. It does not add features to the running application. The compact, six-collection Eraser diagram is [dataModeling.eraserdiagram](./dataModeling.eraserdiagram); the exact field-level diagram is [dataModeling.detailed.eraserdiagram](./dataModeling.detailed.eraserdiagram). Model-by-model explanations are in [DATA_MODEL.md](./DATA_MODEL.md).

## 1. Why six models, not four or five?

| Collection | Purpose | Category |
| --- | --- | --- |
| `Passenger` | Passenger identity, contact, authentication and photo | Core account |
| `Driver` | Driver identity, licence, Tesla, verification and selected location | Core account |
| `RideRequest` | One Passenger's ride, own quote/payment/status/history | Core ride |
| `Pool` | One Driver's shared trip, assigned members and capacity | Core ride |
| `EmailOtp` | Temporary registration verification by role and email | Supporting |
| `FareSettings` | Admin-controlled current base/km/discount rates | Supporting |

The screenshot showed the **four large core collections** in its current viewport. `EmailOtp` and `FareSettings` were off to the side because Eraser auto-arranged the tall, full-field diagram. There are **six** model files and six MongoDB collections in this design. There is no MongoDB `Admin` model: the present Admin login is configured in `.env`. `Pool.members[]`, ride history, fare rule and verification history are **embedded fields**, not additional collections.

## 2. Final data relationships

```text
Passenger 1 ── N RideRequest N ── 0..1 Pool N ── 1 Driver
                                  Pool has 1..4 active member requests,
                                  but member seat totals must fit 2..4 capacity.

EmailOtp: temporary record identified by (role, email); no account ObjectId FK.
FareSettings: one current rate document; its values are copied into each new ride.
```

- The same email/username may exist in Passenger and Driver collections. Each is unique **within its own role**. Login always selects a role before searching its collection.
- `RideRequest.passenger` points to the owning Passenger. `RideRequest.pool` is null until assignment, then points to one Pool. `Pool.driver` points to one Driver. `Pool.members[]` embeds references to the assigned requests/passengers and seat/destination snapshots.
- Store the Passenger's fare/payment/status on `RideRequest`, not in `Passenger` or only in `Pool`. Store Driver/vehicle and member snapshots on `Pool`, so later profile edits do not alter history.
- Keep completed/cancelled requests and pools. History is a filtered view of these records, **not** a new history collection.

## 3. Final product flow

### Passenger

1. Register with role `passenger`, unique Passenger username/email, phone, password and email OTP. Sign in by email or username.
2. Choose predefined pickup and destination areas, 1–4 seats and Cash or simulated TeslaPay. Request an estimate; the backend calculates and returns solo/shared quotes.
3. Submit request. The backend recalculates using **current Admin rates**, saves both quotes and the rate snapshot, and creates `REQUESTED`. A quote previously shown in the browser may change if Admin edited rates before booking.
4. See only own active ride/status/current fare and permitted cancellation button. On `COMPLETED` or `CANCELLED`, see own history and status timeline. Never receive another Passenger's personal details.

### Driver

1. Register with role `driver`, unique Driver username/email, licence, expiry, Tesla details, passenger-seat capacity and usual service area. Email OTP applies here too.
2. Admin reviews the submitted Driver. Only an `approved` Driver can choose a **current manual area** and go online. The usual area and current area remain separate fields.
3. An online Driver sees suitable `REQUESTED` rides from their current pickup area. They accept one; compatible waiting requests may join the Pool while it is `MATCHED` and seats remain.
4. Driver sees assigned Passenger names, destinations and seat counts; then advances their own Pool through arrival, start and completion. Only the assigned Driver may confirm receipt of due Cash payment.

### Admin

1. Separate Admin login. Sidebar: overview/statistics, Driver review, Drivers, Passengers, Fare settings.
2. Driver review: inspect pending/unverified applications, approve/reject. Driver list/detail: search/filter, see verification history and mark a previously approved/rejected Driver unverified when needed.
3. Passenger list/detail: see only account information needed for support (name, username, email, phone, photo, email verification, join date). **No Passenger ride history** in Admin account detail.
4. Fare settings: edit base fare, per-km fare and shared discount. Changes apply to **new** quotes/bookings only; existing ride snapshots remain unchanged.

## 4. Matching, seats and ride status

Matching is deliberately simple and deterministic: **same pickup area** and destinations on a defined compatible corridor. The Driver accepts the first request; later compatible waiting requests can join before the Driver marks arrival. It is not actual road routing, automatic optimal dispatch or a one-second response guarantee.

Passenger request: `REQUESTED → MATCHED → DRIVER_ARRIVED → STARTED → COMPLETED`. A Passenger may cancel from `REQUESTED`, `MATCHED` or `DRIVER_ARRIVED`, producing `CANCELLED`; after `STARTED`, cancellation is closed. A Pool starts at `MATCHED` and advances with its members. If its last member cancels before start, the Pool becomes `CANCELLED`.

The capacity invariant is `occupiedSeats = Σ current members.seats ≤ capacity`, with Driver capacity 2–4. Accept/join/cancel must update the Pool and related request inside a MongoDB transaction. A conditional atomic update must recheck the remaining seat count in MongoDB; checking only in React or from a stale read is unsafe for the final seat. Partial unique indexes allow at most one active request per Passenger and one active Pool per Driver.

## 5. Fare and payment contract

```text
approximateKm = max(1, round(straight-line distance between fixed area centres))
soloFarePaisa = (baseFarePaisa + approximateKm × perKmPaisa) × requestedSeats
sharedFarePaisa = round(soloFarePaisa × (100 − sharedDiscountPercent) / 100)
```

Money is stored in integer paisa. Admin chooses the three rates; until saved, the current demo defaults are ৳50 base, ৳20/km and 20% discount. At ride creation, save `approximateKm`, both quotes and `fareRule`. At completion, use the **shared quote only if at least two requests remain in the Pool**; otherwise use the solo quote. Save `finalFarePaisa` and do not reprice the ride later.

Cash becomes `due` on completion and the assigned Driver can mark it `paid`. TeslaPay is **simulated** and records `paid` without charging a wallet or gateway. A real gateway, refunds and financial ledger are outside this MVP.

## 6. Pages and information boundaries

| Role | Dashboard | Profile | History |
| --- | --- | --- | --- |
| Passenger | Area map, quote/request, active ride and status | Own name/photo; email/username display-only | Own completed/cancelled requests, own fare and timeline |
| Driver | Manual current area, online/offline, offers, active Pool/actions | Own identity, licence, Tesla and photo; email/username display-only | Own completed/cancelled Pools and assigned-member summary |
| Admin | Counts and management sections | Not a Passenger/Driver profile | Driver verification decision history only; no Passenger ride history |

Authentication and authorization must be enforced by backend middleware and queries. Frontend route hiding is only a presentation aid. Avatar upload keeps a local retry file until Cloudinary succeeds; private Cloudinary IDs and pending filenames are not exposed on Admin's Passenger view.

## 7. Deployment and completion checks

Runtime: one Docker application container serves React and Express at `localhost:4000`; MongoDB Atlas, Cloudinary and SMTP are external. Secrets remain in ignored `backend/.env`. The current map shows selected area positions, **not live GPS**.

The MVP is complete only when these checks pass:

1. Passenger/Driver register, verify email, login by username or email, refresh session and logout; logged-out Back cannot access protected data.
2. Admin-only approval controls Driver online state. Offline/unapproved Drivers receive no offers. Admin Passenger detail never returns ride history or authentication secrets.
3. Same-pickup/compatible-corridor matching behaves consistently; incompatible or full Pools leave requests waiting.
4. Concurrent requests for the final seat never push `occupiedSeats` above capacity; request and Pool status remain consistent after cancellation or advancement.
5. Admin fare changes alter new estimates/bookings but not earlier ride quotes/final fares; Cash and simulated TeslaPay states are distinguishable.
6. Each role sees only its authorized history; completed/cancelled records remain readable after profile edits.
7. Backend tests, Atlas integration test, frontend build and Docker health check pass. Test the failure path for Atlas and Cloudinary as well as the success path.

## 8. Explicitly outside this MVP

Do not silently add live GPS tracking, route optimization, real payments, chat, ratings, push notifications, Redis, Kubernetes or a separate Admin database model to this final design. Those require their own requirements, privacy rules and data migrations later.
