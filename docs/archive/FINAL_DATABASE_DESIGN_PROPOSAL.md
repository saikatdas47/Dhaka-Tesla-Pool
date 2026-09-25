# Dhaka Tesla Pool — proposed database design (design only)

**Status:** proposal for review. This is the target design, **not** a claim that the current Mongoose code or Atlas database has been migrated. No application schema, data, or API was changed while preparing it.

## 1. Boundaries and principles

- MongoDB collections: `Passenger`, `Driver`, `EmailOtp`, `FarePolicy`, `RideRequest`, `Pool` (six). The first four account/configuration collections are not all ride entities. An `Admin` collection is unnecessary while there is exactly one environment-configured admin; introduce one only when multiple admins and attributable decisions are required.
- Passenger and Driver remain **separate login domains**. Username/email uniqueness is per role; the same value may exist in both collections. Never merge them merely to draw one more ERD line.
- One Driver has one registered vehicle in the MVP; keep vehicle fields inside Driver. A separate Vehicle collection is justified only if a driver can operate multiple vehicles or a vehicle can change owners.
- Money is integer paisa, not floating currency. Times are UTC dates. Area names are canonical codes selected from a single predefined area list; don't store free-form near-duplicates.
- MongoDB `ObjectId` references are logical references, **not DB-enforced foreign keys**. Authorization, transactions, and delete/retention rules enforce consistency.
- Historical ride facts are snapshots. Profile, vehicle, area labels, and rate changes must not rewrite completed rides.

## 2. Entity relationships — authoritative cardinalities

```text
Passenger 1 ─── 0..N RideRequest
Driver    1 ─── 0..N Pool
Pool      1 ─── 0..N RideRequest (a request has 0..1 pool)
FarePolicy 1 ── 0..N RideRequest (a request uses exactly one policy version)

Pool.members[]: small bounded, embedded current seat assignments;
each item references exactly one RideRequest and Passenger.

EmailOtp ──(role + normalized email; temporary registration flow)──>
           future Passenger OR Driver. This is NOT an ObjectId FK.
```

The final ERD is [FINAL_DATABASE_DESIGN.eraserdiagram](./FINAL_DATABASE_DESIGN.eraserdiagram). It draws only real stored references. The flow diagram [FINAL_DATABASE_LIFECYCLE.eraserdiagram](./FINAL_DATABASE_LIFECYCLE.eraserdiagram) additionally shows the two **logical** connections: OTP to registration, and fare policy to quote/snapshot. A disconnected pre-registration OTP in the physical ERD is intentional, not an omitted relationship.

## 3. Target collections

| Collection | Identity and key fields | References / embedded data | Purpose |
| --- | --- | --- | --- |
| `Passenger` | `_id`, name, username, email, phone, passwordHash, emailVerifiedAt, avatar metadata, refreshTokenHash | None | Passenger account. Do not embed ride history. |
| `Driver` | `_id`, name, username, email, phone, license number/expiry, vehicle model/registration/color, passengerSeats 2–4, serviceArea, availability, currentArea, locationSource, locationUpdatedAt, verificationStatus/history, auth/avatar metadata | None | Driver and single vehicle. Usual service area differs from selected current location. |
| `EmailOtp` | `_id`, role, normalized email, otpHash, registrationTokenHash, attempts, sentAt, expiresAt | No account ObjectId | Short-lived pre-account challenge; unique `(role,email)` and TTL on expiry. Never store plain OTP. |
| `FarePolicy` | `_id`, revision, baseFarePaisa, perKmPaisa, sharedDiscountPercent, status (`active`/`retired`), effectiveFrom, retiredAt?, createdAt | Referenced by `RideRequest.farePolicy` | Immutable price numbers for each published admin revision. One active version; admin change retires the prior version and inserts a new one in a transaction. Replaces the mutable singleton `FareSettings` in the target design. |
| `RideRequest` | `_id`, passenger, pool?, pickupArea, destinationArea, seats 1–4, approximateKm, soloFarePaisa, pooledFarePaisa, finalFarePaisa?, paymentMethod/status, status/history, timestamps | Passenger FK, Pool FK?, FarePolicy FK; fareRule snapshot; passenger name snapshot | Canonical passenger-owned ride, individual fare, status and history. |
| `Pool` | `_id`, driver, pickupArea, firstDestinationArea, capacity, occupiedSeats, status/history, timestamps | Driver FK; bounded `members[]` request/passenger references and assignment snapshots; driver/vehicle snapshot | One driver's shared trip and seat inventory. |

`fareRule` remains copied into each request even with the policy FK. The reference identifies the exact admin revision; the snapshot preserves a readable invoice/history if policies are archived or code changes. Store calculation inputs and the chosen result, not only a formula name. Fare is `(baseFarePaisa + approximateKm × perKmPaisa) × seats`; actual sharing gives `round(soloFarePaisa × (100 − sharedDiscountPercent) / 100)`. The discount applies only when at least two active requests share the completed Pool. The system uses estimated area distance, not live road distance.

Keep driver verification decisions in `Driver.verificationHistory[]` for the single-admin MVP; each event needs status, timestamp, actor label and optional reason. If multiple admin accounts arrive, use an `Admin` collection and an immutable review/audit record rather than relying on a free-text actor label.

## 4. Critical indexes and invariants

| Invariant / query | Target enforcement |
| --- | --- |
| Username and email unique inside Passenger; same inside Driver | Separate unique indexes after normalization. A migration must handle legacy duplicates before index creation. |
| License and registration unique among Drivers | Unique normalized indexes. |
| One active request per Passenger | Partial unique `{passenger:1}` for `REQUESTED`, `MATCHED`, `DRIVER_ARRIVED`, `STARTED`. |
| One active Pool per Driver | Partial unique `{driver:1}` for `MATCHED`, `DRIVER_ARRIVED`, `STARTED`. |
| Offers and history | `{pickupArea:1,status:1,createdAt:1}`; `{passenger:1,createdAt:-1}`; `{driver:1,createdAt:-1}`. |
| Fare versioning | Unique `revision`; unique partial index on `{status:1}` filtered to `status="active"`, with retire-and-publish in one transaction. Never allow two active policies or an unpriced new request. |
| Capacity | `occupiedSeats = sum(active members.seats)` and `0 ≤ occupiedSeats ≤ capacity`; a conditional atomic Pool update inside a transaction with RideRequest updates. Application-side prechecks alone are insufficient. |
| Membership | A matched active request appears once in its Pool members; its `pool` points back. Completed/cancelled requests retain historical pool reference even if no longer in current members. |
| Lifecycle | Only server-approved status transitions; append timestamped events to both request and Pool in the same transaction. No deletion of completed/cancelled records for ordinary UI actions. |
| Driver offers | Only approved, online Drivers at a selected currentArea receive compatible waiting requests. Approved/online status is checked again when accepting, not only when listing. |
| Privacy | Passenger queries filter by authenticated passenger ID; Driver sees assigned Pool passengers; Admin passenger details omit ride history. Credentials, token hashes and OTP hashes never leave API. |

The bounded `Pool.members[]` is appropriate for 2–4 passenger seats. Do not create a separate `PoolMember` collection solely to make the diagram look more relational. Put a unique request membership check and seat-capacity condition in the transaction. For route compatibility, store canonical area codes and use one documented matching function (same pickup plus compatible corridor); do not persist a redundant route graph in each ride.

## 5. Lifecycle and consistency example

1. Passenger/Driver registration requests OTP. `EmailOtp` is keyed by role+email. Upon successful verification, create the matching account and consume the challenge. The account does not exist before this step, so an OTP-to-account FK would be false.
2. Admin publishes fare revision `N`. A new request reads `N`, stores its `farePolicy` ObjectId, numeric `fareRule` snapshot, approximate distance and integer-paisa quotes. Later fare changes create revision `N+1`; old requests keep `N`.
3. Approved online Driver accepts. A transaction creates/joins a Pool, reserves seats conditionally, writes member snapshot and changes request status. Concurrent last-seat attempts cannot both succeed.
4. Arrived → started → completed advances Pool and member requests together. At completion each Passenger's final fare/payment state is frozen on their own RideRequest. Cash can be due until confirmed; TeslaPay is simulated, never a real gateway.
5. Passenger history reads only their RideRequests. Driver history reads own Pools. Admin account list/detail is separate from Passenger history.

## 6. Migration plan (do not execute before approval)

1. Audit Atlas backup, current indexes, invalid/duplicate usernames, emails, licenses and registration numbers; report counts without exposing secrets.
2. Introduce `FarePolicy` and insert revision 1 from current `FareSettings`. Backfill existing RideRequests from their saved `fareRule`; where old records lack a reliable rule, preserve quotes and mark policy linkage as legacy/unknown rather than inventing a rate.
3. Deploy dual-read compatibility for old requests, then write policy references for new ones; build indexes after duplicate cleanup.
4. Update Admin fare editing to publish a new immutable policy; update estimate/request creation to use one active revision. Verify concurrent rate updates and quote consistency.
5. Verify sample full lifecycle, last-seat concurrency, cancellations, history privacy, OTP expiry, approval/offline behavior, and Docker/Atlas integration. Only after checks, retire the old singleton path. Do not delete historical rides or fare evidence.

## 7. Deliberately outside this database design

No payment gateway ledger, live GPS tracks, route optimization, chat, ratings, Redis, Kubernetes or extra analytics collections. Add them only when their product requirements are approved; the present model should not pretend they already exist.
