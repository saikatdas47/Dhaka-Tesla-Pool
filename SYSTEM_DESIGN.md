# Dhaka Tesla Pool — system architecture and data model

Companion diagram: [`systemArcitecture.drawio`](./systemArcitecture.drawio), with three pages: system overview, MongoDB data model, and ride lifecycle. An [Eraser.io flowchart version](./systemArcitecture.eraserdiagram) is also available; the [field-level Eraser ERD](./dataModeling.eraserdiagram) is separate. This describes the **current MVP** and explicitly separates future ideas. It is a design reference, not a claim that live GPS, real payments, or route optimization already exist.

## 1. Product boundary

| Actor | Can do | Cannot do |
| --- | --- | --- |
| Passenger | Register/login, request 1–4 seats, get a quote, choose cash or simulated TeslaPay, see/cancel own valid ride, see own history and profile | Read another Passenger's ride, pool members' private details, or admin data |
| Driver | Register/login, update profile and manually selected current area, go online after approval, view relevant requests, accept and advance own pool, see assigned passengers/seats and own trip history | Go online without approval, view offers while offline, advance another Driver's pool |
| Admin | Review driver applications, approve/reject/unverify, view Driver and limited Passenger account information, set fare rates | See Passenger ride history through the Admin account page; silently change old ride fares |

The **usual service area** on a Driver profile and their **current selected area** are different fields. The latter powers the approximate area map and request filtering. Neither is live GPS.

## 2. Runtime and trust boundaries

The browser runs one React SPA. Express serves the built SPA and `/api` from one Docker container on port 4000. MongoDB Atlas is external; Cloudinary stores profile photos; SMTP sends registration OTPs. There is no local MongoDB container in the current Compose file.

Flow: `Browser → React route → Express route → role middleware → controller/service → MongoDB`. Avatar uploads additionally go through Multer to a local retry file and then Cloudinary. Password hashes, refresh-token hashes, OTP hashes, SMTP credentials and Atlas credentials never belong in public API responses or the diagram.

Role-specific access tokens are checked on protected APIs. Passenger, Driver and Admin sessions are separate; a frontend route alone is **not** an authorization boundary. Admin's account page exposes a deliberately small Passenger projection and never queries their rides.

The current Admin account is configured through `backend/.env`, **not** an `Admin` MongoDB collection. Passenger and Driver are separate account collections: the same email/username may exist once in each role, and login checks the selected role's collection only.

## 3. Data ownership and relationships

| Collection | Owns | References and important constraints |
| --- | --- | --- |
| `Passenger` | Identity, contact, password/token hashes, email verification, photo | Username and email unique **within Passenger**. One active `RideRequest` per Passenger is enforced on the ride collection. |
| `Driver` | Identity, licence, Tesla, 2–4-seat capacity, usual/current area, online state, verification history | Username, email, licence and vehicle registration unique **within Driver**. One active `Pool` per Driver is enforced on the pool collection. |
| `EmailOtp` | Registration challenge/token hashes, expiry and attempt count | Unique `(role, email)`; TTL removes expired records eventually. |
| `FareSettings` | Current base fare, per-km fare and shared discount | Singleton `_id: "current"`; amounts are integer paisa. Default rates are used until Admin saves settings. |
| `RideRequest` | One Passenger's requested route, seats, fare quotes, applied fare-rule snapshot, final fare, payment and status history | `passenger → Passenger`, optional `pool → Pool`. Historical route, fare and Passenger name are snapshots. One active request per Passenger via partial unique index. |
| `Pool` | One Driver's shared trip, vehicle/driver snapshots, members, occupied/capacity seats, status history | `driver → Driver`; each `members[]` entry references a `RideRequest` and Passenger. One active pool per Driver via partial unique index. |

The relationship is `Passenger 1—many RideRequest`, `Driver 1—many Pool`, and `Pool 1—many RideRequest` over time. A request has zero or one Pool: zero while waiting or cancelled before matching. `Pool.members[]` is the active membership list; `RideRequest.pool` links back. Both sides are changed together in a MongoDB transaction. The Pool's `occupiedSeats` is the sum of its current members' seats, and must never exceed `capacity`.

Keep **snapshots** for history rather than copying live profile fields at read time: pickup/destination, Passenger/Driver names, vehicle, seats, quoted solo/shared fares, applied fare rule, status events and payment result. A later profile or Admin fare change must not rewrite a completed trip. No separate history collection is necessary: completed/cancelled `RideRequest` and `Pool` records are the history.

## 4. Ride and matching decisions

1. Passenger chooses pickup, destination, seats and payment method. Server validates the named Dhaka areas, returns an estimate, then **recalculates** with current Admin rates when the request is created. If Admin changes rates between estimate and booking, the booking quote is authoritative.
2. A waiting request is `REQUESTED`. Only an approved, online Driver in that pickup area sees it. Driver acceptance creates/joins a Pool and changes it to `MATCHED`.
3. Additional waiting requests may join while the Pool is `MATCHED` if pickup is the same, destinations are in a configured compatible corridor, and enough seats remain. This is **zone/corridor matching**, not road routing or an ETA guarantee.
4. Pool and member requests advance together: `MATCHED → DRIVER_ARRIVED → STARTED → COMPLETED`. Passenger cancellation is allowed at `REQUESTED`, `MATCHED`, or `DRIVER_ARRIVED`; not after `STARTED`. An empty Pool becomes `CANCELLED`.
5. At completion, each Passenger's final fare is chosen from **their own stored quote**: shared quote if at least two requests remain in the Pool, otherwise solo. Cash becomes due; the assigned Driver may mark it paid after receiving it. TeslaPay is simulated only: paid status is recorded, but no wallet balance or real transfer exists.

To protect the last seat, joining uses a conditional atomic capacity check and a MongoDB transaction for the Pool and `RideRequest` updates. Do not implement this as a frontend-only check. All status transitions should be server-validated and append a timestamped history event.

## 5. Fare design

The current calculation uses fixed area-centre coordinates to approximate straight-line distance, rounded to whole kilometres with a one-kilometre minimum. It is **not** actual travel distance.

```text
soloFarePaisa = (baseFarePaisa + approximateKm × perKmPaisa) × requestedSeats
sharedFarePaisa = round(soloFarePaisa × (100 − sharedDiscountPercent) / 100)
```

Admin can edit all three monetary/discount inputs in **Fare settings**. Initial defaults are 5,000 paisa (৳50), 2,000 paisa/km (৳20/km), and 20% shared discount; they are demo assumptions, not official market prices. Money remains integer paisa to avoid floating-point currency drift. For a one-seat, approximately two-kilometre ride under those defaults: solo = 9,000 paisa (৳90); shared = 7,200 paisa (৳72). The quote, rule snapshot and final fare on an existing ride do not reprice when the Admin changes the global settings.

## 6. API and privacy map

| Area | Main endpoints | Access |
| --- | --- | --- |
| Auth/profile | `/api/passengers/*`, `/api/drivers/*`, `/api/email-otp/*` | Correct account role, except public registration/login/OTP initiation |
| Passenger ride | `/api/rides/quote`, `/api/rides/requests`, `/api/rides/mine`, cancellation, nearby Drivers | Passenger only; `mine` filters by authenticated Passenger ID |
| Driver ride | `/api/rides/offers`, `/api/rides/driver/current`, `/api/rides/driver/history`, accept, pool status, cash confirmation | Driver only; approval/online/location gates offers and acceptance |
| Admin | `/api/admin/drivers`, `/api/admin/passengers`, `/api/admin/fare-settings` | Admin session only |

The Admin Passenger list/detail returns name, username, email, phone, photo, email verification and join date only. It does **not** return ride history, password/token hashes, Cloudinary internal IDs or pending local filenames. A Passenger's response must not include another Passenger's personal information, even if they share a Pool.

## 7. Reliability, deployment and testing

- Docker Compose builds a single application image, mounts an uploads volume for failed-photo retries, and checks `/health`; Atlas connectivity is required for database APIs.
- Keep all service secrets in ignored `backend/.env`; never embed them in the React build or diagrams. Disable local demo/admin autofill outside the local test environment.
- Test boundary cases: duplicate username/email per role, unauthorized APIs, offline/unapproved Driver offers, incompatible routes, 2–4-seat capacity, concurrent last seat, cancellation vs status races, fare-setting changes after booking, payment status, history privacy, and Docker restart with Atlas available/unavailable.
- Before treating the MVP as production-ready, add operational decisions for backup/restore, rate-change audit trail, real payment reconciliation, incident logging, stronger admin role separation, and actual geolocation/routing. These are **future design choices**, not implemented features in the current diagram.

## 8. Build order for any next phase

1. Freeze the current MVP contract and test cases, especially statuses, pricing and privacy.
2. Decide one feature's data fields and invariants before changing the UI.
3. Add/adjust model and indexes, then controller authorization and tests.
4. Wire the role-specific UI, including loading/errors and history presentation.
5. Run unit, Atlas integration, build and Docker checks; update this diagram when the actual architecture changes.

This order avoids a common failure mode: attractive screens that assume data or permissions the backend does not actually provide.
