# Dhaka Tesla Pool — MongoDB data modeling

This is the field-level model for the **current MVP**, separate from the [system architecture](./SYSTEM_DESIGN.md). The editable ER diagrams are [dataModeling.drawio](./dataModeling.drawio), the compact [six-collection Eraser.io overview](./dataModeling.eraserdiagram), and the [full-field Eraser.io version](./dataModeling.detailed.eraserdiagram). It is based on the current Mongoose models; recommendations are explicitly marked and are **not** database changes.

## 1. Modeling decisions

- `Passenger` and `Driver` are separate collections and login domains. The same email or username may belong to one account in each role; uniqueness is enforced **within** each collection, not across both.
- There is no `User` base collection and no `Admin` collection. Admin credentials currently live in ignored environment configuration.
- A `RideRequest` belongs to exactly one Passenger and may belong to zero or one `Pool`. A `Pool` belongs to exactly one Driver and has one or more active member requests while operating.
- Keep current membership in `Pool.members[]` for a small, bounded 2–4-seat pool. Keep the Passenger-owned request as the canonical source of that Passenger's fare, payment and status. Updating both documents is a transaction boundary.
- Copy historical facts into the ride/pool at booking or matching: names, route, vehicle, seat count, quoted fares and fare rule. Live account edits or Admin rate changes must not rewrite history.
- Store money as **integer paisa**. All timestamps are UTC `Date` values; convert to local time only for display.

Legend below: `PK` = primary key, `FK` = ObjectId reference, `U` = unique index, `P` = partial unique index, `TTL` = expiry index. `?` means optional or nullable. `[]` means an embedded array.

An `FK` here is a **logical Mongoose reference**, not a MongoDB-enforced foreign key. Controllers and transactions must maintain referential consistency; deleting an account requires an explicit retention/anonymization policy rather than assuming automatic cascades.

## 2. Entity relationships

```text
Passenger (1) ─────── (many) RideRequest (many) ─────── (0..1) Pool (many) ─────── (1) Driver
                                   │                      │
                                   └── pool FK ───────────┘
Pool.members[] contains request FK + passenger FK + assignment snapshots.
FareSettings (one current document) ── copied into each new RideRequest.fareRule.
EmailOtp is keyed by (role, email); it has no ObjectId FK to an account before registration.
```

The `Pool` to `RideRequest` relationship is **one Pool to many requests**. A cancelled request may retain its historical `pool` link even after it is removed from current `Pool.members[]`; do not infer active membership from the FK alone.

## 3. Collection: `Passenger`

| Field | Type | Rule / purpose |
| --- | --- | --- |
| `_id` | ObjectId, PK | Account identity |
| `name` | String | Required, trimmed, max 80 |
| `username` | lowercase String, P | Required for new accounts; partial unique index accommodates legacy records without it |
| `email` | lowercase String, U | Required, unique in Passenger collection |
| `phone` | String | Required for new accounts; legacy records may lack it |
| `passwordHash` | String, private | Required; `select: false`; never return in API |
| `refreshTokenHash` | String?, private | `select: false`; session rotation/revocation |
| `emailVerifiedAt` | Date? | Registration email verification |
| `isDemo` | Boolean | Default `false`; demo access can be disabled |
| `avatarUrl`, `avatarPublicId` | String? | Public photo URL versus Cloudinary internal identifier |
| `pendingAvatarFilename` | String? | Local upload retained for failed Cloudinary retry |
| `createdAt`, `updatedAt` | Date | Mongoose timestamps |

No ride IDs or history array are embedded in `Passenger`. Query `RideRequest` by authenticated `passenger` ID instead. Admin account detail uses an allowlist of name, username, email, phone, avatar URL, verification time and join date; **no ride query is made**.

## 4. Collection: `Driver`

| Field | Type | Rule / purpose |
| --- | --- | --- |
| `_id` | ObjectId, PK | Driver identity |
| `name`, `username`, `email`, `phone` | Strings | Required; username/email lowercase and unique in Driver collection |
| `passwordHash`, `refreshTokenHash` | Strings?, private | Login/session values; `select: false` |
| `emailVerifiedAt`, `isDemo` | Date?, Boolean | Registration and demo controls |
| `avatarUrl`, `avatarPublicId`, `pendingAvatarFilename` | Strings? | Photo and upload retry state |
| `licenseNumber` | uppercase String, U | Required, unique in Driver collection |
| `licenseExpiry` | Date | Required |
| `vehicleModel` | String enum | `Model 3`, `Model Y`, `Model S`, `Model X` |
| `vehicleRegistrationNumber` | uppercase String, U | Required, unique in Driver collection |
| `vehicleColor` | String | Required |
| `passengerSeats` | Number | Integer 2–4 is enforced by request/controller validation; schema declares min 2, max 4 |
| `serviceArea` | String | Usual service area; **not** current position |
| `availability` | `offline` / `online` | Defaults to offline |
| `currentArea` | String? | Manually selected operating area used for offers/map |
| `locationSource` | `manual` / `gps` | Defaults to manual; current MVP uses manual area selection |
| `locationUpdatedAt`, `lastOfferAcceptedAt` | Date? | Location freshness and most recent accept |
| `verificationStatus` | `pending` / `approved` / `rejected` / `unverified` | Admin decision; defaults to pending |
| `verificationHistory[]` | Embedded `{status, at, by}` | Decision audit events |
| `createdAt`, `updatedAt` | Date | Mongoose timestamps |

An approved Driver may go online. An offline or unapproved Driver receives no offers. An Admin unverify action also sets availability offline. A current trip may still be completed after revocation, so trip status and account approval are separate concepts.

## 5. Collection: `RideRequest`

| Field | Type | Rule / purpose |
| --- | --- | --- |
| `_id` | ObjectId, PK | One Passenger's ride request |
| `passenger` | ObjectId FK → Passenger | Required; authorization filter for own rides |
| `passengerName` | String? | Name snapshot at request time |
| `pickupArea`, `destinationArea` | String | Selected Dhaka areas; must differ |
| `seats` | Number | Integer 1–4, also limited by actual pool capacity |
| `approximateKm` | Number | Whole-kilometre estimate from fixed area centres |
| `soloFarePaisa`, `pooledFarePaisa` | Number | Required integer-paisa quotes frozen at booking |
| `fareRule` | Embedded `{baseFarePaisa, perKmPaisa, sharedDiscountPercent}` | Rate snapshot; older records may not have it |
| `finalFarePaisa` | Number? | Set at completion; solo or pooled quote according to final membership |
| `paymentMethod` | `cash` / `teslapay` / null | TeslaPay is simulated, not a gateway |
| `paymentStatus` | `pending` / `due` / `paid` / `cancelled` / null | Result of simulated payment lifecycle |
| `paidAt` | Date? | When marked paid |
| `status` | `REQUESTED`, `MATCHED`, `DRIVER_ARRIVED`, `STARTED`, `COMPLETED`, `CANCELLED` | Defaults to `REQUESTED` |
| `pool` | ObjectId FK → Pool? | Null before match; may remain after cancellation as historical link |
| `history[]` | Embedded `{status, at}` | Ride and payment events in order |
| `createdAt`, `updatedAt` | Date | Mongoose timestamps |

Existing indexes: `{pickupArea:1,status:1,createdAt:1}` for waiting offers; `{passenger:1}` **partial unique** for statuses `REQUESTED`, `MATCHED`, `DRIVER_ARRIVED`, `STARTED`; plus the schema's `status` index. Thus one Passenger can have many completed/cancelled rides but only one active ride.

## 6. Collection: `Pool`

| Field | Type | Rule / purpose |
| --- | --- | --- |
| `_id` | ObjectId, PK | One Driver trip/pool |
| `driver` | ObjectId FK → Driver | Required; Driver authorization filter |
| `pickupArea`, `firstDestinationArea` | String | Matching anchor: same pickup + compatible corridor |
| `vehicleName`, `vehicleRegistrationNumber`, `vehicleColor` | Strings | Vehicle snapshot at assignment |
| `driverName`, `driverAreaAtMatch` | Strings? | Driver/location snapshot |
| `capacity` | Number | 2–4 available Passenger seats, copied from Driver at pool creation |
| `occupiedSeats` | Number | Sum of current member seats, 0–capacity |
| `members[]` | Embedded assignment | `{request: ObjectId FK, passenger: ObjectId FK, passengerName, seats, destinationArea}` |
| `status` | `MATCHED`, `DRIVER_ARRIVED`, `STARTED`, `COMPLETED`, `CANCELLED` | Defaults to `MATCHED` |
| `history[]` | Embedded event | `{status, at, request?, passengerName?, seats?}` for status/membership events |
| `createdAt`, `updatedAt` | Date | Mongoose timestamps |

Existing `{driver:1}` **partial unique** index applies to `MATCHED`, `DRIVER_ARRIVED`, `STARTED`: one active Pool per Driver. Capacity is enforced at the **database update condition**, not just by the schema. Acceptance/join and Passenger cancellation update `Pool` and `RideRequest` in a MongoDB transaction; competing last-seat requests cannot both claim it.

`Pool.members[]` reflects current membership. For a cancelled former member, the Pool's event history and the request's own history preserve what happened. Driver history reads completed/cancelled Pools and their request references; Passenger history reads only requests filtered by their own ID.

## 7. Supporting collections

### `FareSettings`

Exactly one configured document, keyed by string `_id: "current"`: `baseFarePaisa` (integer), `perKmPaisa` (integer), `sharedDiscountPercent` (integer 0–100), and Mongoose `createdAt/updatedAt`. Admin-only update; new estimates and ride requests read it. If absent, code supplies demo defaults of 5,000 paisa, 2,000 paisa/km and 20%. The ride stores applied values in `fareRule` plus both quotes, so old fares stay stable.

### `EmailOtp`

Fields: `_id`, `role` (`passenger` or `driver`), lowercase `email`, `otpHash?`, `registrationTokenHash?`, `expiresAt`, `sentAt`, `attempts`. Unique compound index `{role:1,email:1}`; TTL index `{expiresAt:1}`. It is a short-lived registration record, not an account and not a permanent email-verification history. Do not store the plain OTP.

## 8. State and consistency invariants

| Invariant | Current enforcement |
| --- | --- |
| At most one active ride per Passenger | Partial unique index on `RideRequest.passenger` |
| At most one active pool per Driver | Partial unique index on `Pool.driver` |
| Seats never exceed capacity | Conditional atomic update plus transaction |
| Request and Pool status advance together | MongoDB transaction in lifecycle controller |
| Passenger can cancel only before `STARTED` | Server status check and transactional update |
| Driver can accept only if approved + online + in pickup area | Server checks in accept transaction |
| Final fare is stable after completion | Stored `finalFarePaisa`; not recalculated from current Admin rates |
| Passenger ride privacy | Server queries by authenticated Passenger ID; Admin account API omits rides |

Money example under defaults, one seat Banani → Mohakhali (`approximateKm = 2`): `(5000 + 2 × 2000) × 1 = 9000` paisa solo; `round(9000 × 0.80) = 7200` paisa shared. The discount applies only if at least two requests remain in the Pool at completion.

## 9. Query paths and indexes

| Query | Existing support | Recommendation, not implemented |
| --- | --- | --- |
| Waiting offers by pickup/status/oldest | `RideRequest {pickupArea,status,createdAt}` | Keep |
| Own active/history requests | `RideRequest {passenger}` partial unique only covers active | Consider `{passenger:1,status:1,createdAt:-1}` for large histories |
| Driver's active pool | `Pool {driver}` partial unique | Keep |
| Compatible Pool search by pickup/status | Conditional capacity query, no dedicated compound index | Consider `{pickupArea:1,status:1,createdAt:1}` after measuring query volume |
| Online Drivers by area/status | No dedicated compound index | Consider `{availability:1,verificationStatus:1,currentArea:1}` after measuring |
| Admin Passenger/Driver search | Escaped, case-insensitive regex | For large datasets, use a purpose-built search index rather than assuming ordinary indexes speed substring regex |

Indexes should be added only with a migration/test plan and observed query need; this document has **not** altered the database schema.

## 10. Sample linked documents (illustrative, not seed data)

```json
{
  "Passengers": [
    { "_id": "650000000000000000000001", "name": "Nusrat", "username": "nusrat", "email": "nusrat@example.test" },
    { "_id": "650000000000000000000005", "name": "Rafiq", "username": "rafiq", "email": "rafiq@example.test" }
  ],
  "Driver": { "_id": "650000000000000000000002", "name": "Jashim", "passengerSeats": 3, "verificationStatus": "approved" },
  "Pool": {
    "_id": "650000000000000000000003", "driver": "650000000000000000000002",
    "pickupArea": "Banani", "firstDestinationArea": "Mohakhali", "capacity": 3,
    "occupiedSeats": 2, "status": "MATCHED",
    "members": [
      { "request": "650000000000000000000004", "passenger": "650000000000000000000001", "seats": 1, "destinationArea": "Mohakhali" },
      { "request": "650000000000000000000006", "passenger": "650000000000000000000005", "seats": 1, "destinationArea": "Gulshan 1" }
    ]
  },
  "RideRequests": [
    {
      "_id": "650000000000000000000004", "passenger": "650000000000000000000001",
      "pool": "650000000000000000000003", "pickupArea": "Banani", "destinationArea": "Mohakhali",
      "seats": 1, "approximateKm": 2, "soloFarePaisa": 9000, "pooledFarePaisa": 7200,
      "fareRule": { "baseFarePaisa": 5000, "perKmPaisa": 2000, "sharedDiscountPercent": 20 },
      "status": "MATCHED"
    },
    {
      "_id": "650000000000000000000006", "passenger": "650000000000000000000005",
      "pool": "650000000000000000000003", "pickupArea": "Banani", "destinationArea": "Gulshan 1",
      "seats": 1, "approximateKm": 2, "soloFarePaisa": 9000, "pooledFarePaisa": 7200,
      "fareRule": { "baseFarePaisa": 5000, "perKmPaisa": 2000, "sharedDiscountPercent": 20 },
      "status": "MATCHED"
    }
  ]
}
```

The example shows only selected fields; real documents also contain required credentials/vehicle details and timestamps. It illustrates consistent references and seat totals, but is **not** a complete seed file.

## 11. Future model decisions — not implemented

Before production, decide whether Admin fare changes require a permanent version/audit collection; whether payment needs an immutable ledger with gateway transaction IDs; and whether live GPS needs time-limited location samples. Those should not be silently added to the MVP models now. Current history and fare snapshots already cover the requested demo flow.
