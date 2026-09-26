# Dhaka Tesla Pool

> Share a seat. Split the fare. Survive Dhaka traffic.

## The story: Banani, 8:41 AM

Jashim is waiting on Banani Road 11 beside **Bullet**, his three-seat, battery-powered “Tesla”—not affiliated with Tesla, Inc. Nusrat is late and requests a ride to Mohakhali. Two minutes later, Rafiq requests a similar journey to Gulshan 1. Then Shirin asks for the last seat.

Can their journeys share one vehicle? Who gets the final seat if two requests arrive together? What should each Passenger pay, and how does Jashim know whom to pick up or drop off next?

## Why this project exists

Dhaka Tesla Pool explores how small vehicles can share available seats between compatible journeys instead of treating every request as a separate trip. The goal is a clear, fair and explainable flow: match forward routes, prevent overbooking, calculate individual fares and keep enough history to explain what happened—without rebuilding Google Maps or adding live GPS.

The story is the product motivation, not a claim that these named accounts or real road distances are used in the current demo.

A shared-ride demo for **2–4-seat vehicles**. Passengers travelling in the same direction can board and leave at different stops. Each has their own fare, status, chat and history.

**Stack:** React · Express · Socket.IO · MongoDB Atlas · Cloudinary

**Flow:** Request → Driver accepts → Arrive → Pick up → Drop off → Payment → Review

## 1. Map & path: why BFS?

The current map is a **tree**: every area pair has one path. BFS finds it with a queue and predecessor links; we add its edge distances afterwards.

- Time/space: **O(V + E)**.
- Distances below are invented demo kilometres, not actual roads.
- BFS does **not** minimize weighted distance when alternative roads exist. Add loops/weighted shortcuts only after switching to Dijkstra.
- The proposed larger cyclic map is **not implemented**.

| Connection            |  km | Connection          |  km |
| --------------------- | --: | ------------------- | --: |
| Dhanmondi ↔ Farmgate  |   3 | Mirpur ↔ Agargaon   |   4 |
| Farmgate ↔ Mohakhali  |   3 | Agargaon ↔ Farmgate |   3 |
| Mohakhali ↔ Gulshan 1 |   2 | Banani ↔ Uttara     |   8 |
| Gulshan 1 ↔ Banani    |   2 | Farmgate ↔ Shahbag  |   3 |
| Banani ↔ Bashundhara  |   4 | Shahbag ↔ Motijheel |   3 |

```text
path = BFS(pickup, destination)
distanceKm = sum(path's edge distances)
```

Example: Dhanmondi → Farmgate → Shahbag → Motijheel = **3 + 3 + 3 = 9 km**.

## 2. Which request can join?

Before the first booking, Driver must be approved, online, have a valid licence and select a starting area. First pickup must equal that area. Every booking requires **Driver acceptance**; passengers are not added automatically.

For an active pool:

- Pickup must be on the remaining path, at or ahead of recorded progress.
- Destination can be any forward stop—including before the first Passenger's destination.
- An outside destination is allowed only if its path follows the **entire remaining pool path first**, then adds a tail. Existing journeys cannot be rerouted.
- Every required segment must have enough seats.

```text
C = current stop index; P = pickup index; D = destination index
On existing path: C ≤ P < D

For extension:
candidate = BFS(new pickup, new destination)
candidate must start with poolPath[P ... last stop]
append only the extra tail; never revisit an old stop
```

### Accept or reject—with reasons

Assume Driver has seats available and is at the start:

| Current pool                             | New request              | Decision & reason                                        |
| ---------------------------------------- | ------------------------ | -------------------------------------------------------- |
| Dhanmondi → Farmgate → Mohakhali         | Dhanmondi → Farmgate     | ✅ Same direction; can leave early                       |
| Same pool                                | Farmgate → Mohakhali     | ✅ Both stops are ahead on the path                      |
| Same pool                                | Farmgate → Gulshan 1     | ✅ Follows Farmgate → Mohakhali, then extends to Gulshan |
| Same pool                                | Farmgate → Mirpur        | ❌ Branches to Agargaon before reaching Mohakhali        |
| Dhanmondi → Farmgate → Agargaon → Mirpur | Agargaon → Mohakhali     | ❌ Must reverse to Farmgate                              |
| Driver progress = Mohakhali              | Pickup = Farmgate        | ❌ Pickup is behind recorded progress                    |
| Any pool, required segment full          | Request for another seat | ❌ Route matches, but capacity does not                  |

**Matching is based on the remaining pool path—not a rotating Passenger “anchor”.** Cancellation releases seats but does not shorten an agreed extension.

## 3. Seats & simultaneous acceptance

Seat reservations are checked **per road segment**, not by adding every booking in the whole trip.

```text
For every segment P ≤ j < D:
reservedSeats[j] + requestedSeats ≤ vehicleCapacity

Pickup: onboardSeats + requestedSeats ≤ vehicleCapacity
Drop-off: onboardSeats -= passengerSeats
```

**Three-seat example:** three seats Mirpur → Mohakhali and three seats Mohakhali → Bashundhara are valid: no segment carries more than three. Drop off the first group before boarding the second.

**Last-seat competition:** two requests see one available seat. Atlas transactions lock/write the Driver and update pool reservations, ride and chat together. Conflicts retry against fresh data; only one booking commits. The loser stays REQUESTED and receives **409**. One active ride per Passenger and one active pool per Driver are enforced by indexes.

## 4. Fare: calculate it by hand

Money uses **integer paisa** (100 paisa = ৳1). Discount rates use **integer basis points** (100 bps = 1%) so Admin can enter 1.50% without storing floating-point percentages.

### Before travel: Admin sets the rules

| Occupied booked seats | Default discount per travelled km |
| --------------------- | --------------------------------: |
| 1                     |                                0% |
| 2                     |                              1.5% |
| 3                     |                                2% |
| 4                     |                              2.5% |

Default base = **৳50 per booked seat**, distance rate = **৳20/km**, maximum discount = **30%** (an editable starting choice, not a mandatory business limit). Admin → Fare settings saves rates/cap in Atlas. Startup inserts defaults only if missing; it never overwrites Admin settings.

Count **occupied booked seats, not accounts or requests**. A single booking for three seats qualifies for the three-seat rate. Pending/accepted seats that have not boarded do not count.

### Request → accept → travel → final fare

1. **Request:** show solo estimate (base + distance), with no discount.
2. **First acceptance:** snapshot all current Admin rates in the pool. Later accepted bookings use the same snapshot; Admin edits affect new pools, not this one.
3. **Pickup/drop-off:** settle the edges actually passed using their onboard seat count. New passengers cannot change older settled edges.
4. **Estimate:** show earned discount plus expected remaining sharing with passengers already onboard, until their booked drop-offs. Accepted but unboarded passengers do not count. Pickup immediately recalculates this estimate.
5. **Own drop-off:** freeze final fare and own breakdown; Cash is due or simulated TeslaPay is paid.
6. **Whole pool ends:** delete temporary working ledger after permanent records are saved.

```text
soloPaisa = basePaisa × bookedSeats + ownDistanceKm × perKmPaisa
earnedDiscountBps = sum(travelledSegmentKm × rateBpsForOccupiedSeats)
appliedDiscountBps = min(earnedDiscountBps, maximumDiscountBps)
finalPaisa = round(soloPaisa × (10000 − appliedDiscountBps) / 10000)
poolDiscountPaisa = soloPaisa − finalPaisa

passengerFare = baseFare + distanceCharge − poolDiscount
```

Distance cost is charged once for the booking; base is per seat. Discount applies to the whole solo fare. Round once to nearest paisa; do not round every segment's percentage. The fixed 20% discount and segment-cost division are **not used for new pools**.

### Example 1: overlap, not just common stops

P1: Mirpur → Agargaon → Farmgate → Mohakhali. P2: Agargaon → Farmgate → Mohakhali → Gulshan 1. Each books one seat.

Shared edges: **Agargaon → Farmgate (3 km)** + **Farmgate → Mohakhali (3 km)** = **6 km**. Three shared nodes do not mean three edges. Both earn **6 × 1.5 = 9%** on their own solo fare. If P1's solo fare is ৳600, final = **৳546** (illustrative fare; current default map/rates give P1 ৳250 → ৳227.50).

### Example 2: occupancy changes

One Passenger's solo fare = ৳600:

| Travelled portion               |    Rate | Earned discount |
| ------------------------------- | ------: | --------------: |
| 3 km with 2 occupied seats      | 1.5%/km |            4.5% |
| Next 2 km with 3 occupied seats |   2%/km |              4% |
| Remaining distance alone        |   0%/km |              0% |
| **Total**                       |         |        **8.5%** |

Final = **600 × 0.915 = ৳549**. At 4 occupied seats a 2 km edge earns **5%**. Rates are alternatives, not added together.

### Example 3: no overlap

P1 gets off at Mohakhali; P2 boards there for Gulshan. They never travel the same edge together: their booking relationship earns **zero extra shared discount**. If each booking has one seat, discount is zero. If one independently has three occupied seats, it still qualifies for the three-seat rate.

### Example 4: cap

Earned discount 42%, Admin cap 30% → applied **30%**. A ৳600 solo fare becomes **৳420**, never ৳348.

### UI & storage

The request form always shows base + distance only. Current ride shows the price sequence: **~~৳600~~ → ~~৳573~~ → ৳549**, with savings. Pickup immediately shows a projected reduction; travelled segments then fix the actual discount. Accept alone does not discount. Each changed estimate is saved on RideRequest, so refresh preserves earlier crossed-out prices. Repeated prices add no extra entries. Projection may change when passengers leave; final fare uses only travelled edges. Final fare and each edge's km, occupied seats and earned percentage appear in own History. Other passengers' fares are private.

`LiveFare` is a temporary collection in the same Atlas database. It stores pool/Driver IDs, settled progress and occupancy. Settlement, permanent RideRequest breakdowns, fare updates and final cleanup use one transaction. No TTL deletes unfinished ledgers. Payment due/paid stays on RideRequest after ledger cleanup.

Older active pools finish with their saved previous fare mode; completed history is unchanged. This is a showcase with action-declared progress, not GPS proof of real travel.

Passenger and Driver dashboards update automatically on successful ride/account changes through Socket.IO. Notifications carry no private ride data: each screen reloads only its authorized data. Reconnection catches missed changes; no periodic polling or page refresh is required. Requests and saved changes still use ordinary API calls.

## 5. Ride actions, chat & privacy

```text
REQUESTED → MATCHED → DRIVER_ARRIVED → STARTED → COMPLETED
REQUESTED / MATCHED / DRIVER_ARRIVED → CANCELLED
```

- Status is individual: picking up one Passenger does not start everyone's ride.
- Pickup/drop-off automatically updates Driver's recorded area. No live GPS or manual in-trip location form.
- Cannot go backwards or skip an earlier assigned pickup/onboard drop-off.
- Arrival closes/deletes only that Passenger's chat; cancellation also deletes it. Payment does not control chat closure.
- One private Socket.IO chat per booking; Atlas keeps messages across refresh. Limits: 1–500 characters, ≥700 ms between sends per socket, 200 messages/chat; 30-day fallback expiry.
- After completion: one **1–5 integer rating + comment (1–1000 characters)** per ride. Driver/Admin see Passenger name, not private email/phone/history.
- Offline is blocked during an active pool. Logout ends the session and stops new offers; assigned trips can resume after login.
- Cancelled members/history remain stored. Pool ends when everyone completes/cancels.

## 6. Try the full pooling example

Use separate browsers/profiles—tabs share login cookies.

1. Driver starts at **Mirpur**, goes online.
2. Accept A: **Mirpur → Mohakhali**.
3. Accept B: **Farmgate → Bashundhara**. Path extends via Gulshan 1 → Banani → Bashundhara.
4. Arrive/pick up A, then B at Farmgate.
5. Drop A at Mohakhali: one seat becomes free; Driver area updates.
6. Accept C: **Gulshan 1 → Bashundhara**, ahead on the remaining path.
7. Pick up C, drop B/C at Bashundhara; confirm Cash.
8. Passenger views own History and reviews Driver.

Map legend: **yellow pickup → purple destination**; blue path; orange proposed extension; green online / grey offline Driver.

## 7. Accounts & photos

Passenger/Driver email and username are unique **within their own role**. Login accepts either. Passenger edits name/photo; Driver also edits phone/licence/vehicle details. Email/username are read-only. Licence/vehicle edits return approval to pending; active capacity cannot change.

HTTP-only access/refresh cookies, rotating hashed refresh tokens and protected APIs handle sessions. OTP: **5-minute expiry, 60-second resend wait, 5 wrong attempts**. Admin sees account information and manages Driver approval/fare rules—not Passenger ride history.

Photos: JPG/PNG/WebP, **5 MB maximum**. Replace deletes old Cloudinary photo first; successful upload deletes local file. Failed upload keeps a retry file. Remove-photo and default avatars are supported.

## 8. Run it

Copy `backend/.env.example` to ignored `backend/.env`; set Atlas, token secrets, email, Cloudinary and Admin credentials. Never commit secrets.

**Docker Desktop running:**

```sh
docker compose up --build
```

Open **http://localhost:4000**. One app container serves frontend/API/chat; MongoDB stays in Atlas. Upload retry files use a Docker volume.

**Without Docker:**

```sh
npm ci --prefix frontend
npm ci --prefix backend
npm run build
npm start
```

Build output: `backend/public`. Health endpoint: `/health`. Database outages return 503 for affected APIs.

Demo: `ENABLE_DEMO_ACCOUNTS=true` only intentionally. Keep `ENABLE_ADMIN_AUTOFILL=false` publicly—it exposes Admin credentials.

### Render

| Setting        | Value                                                                  |
| -------------- | ---------------------------------------------------------------------- |
| Runtime / root | Node / repository root                                                 |
| Build          | `npm ci --prefix frontend && npm ci --prefix backend && npm run build` |
| Start / health | `npm start` / `/health`                                                |
| Environment    | `NODE_ENV=production`, `COOKIE_SECURE=true`; required credentials      |
| Atlas          | Allow Render outbound addresses; let Render supply PORT                |

**Free-tier caveats:** current Gmail SMTP OTP needs replacement with an HTTPS email provider. Local failed-upload retries do not survive Render restarts. No public deployment is claimed.

## 9. Tests & code pointers

```sh
npm test
cd backend
RUN_ATLAS_INTEGRATION=true node --env-file=.env --test tests/ride.integration.test.js
```

Regular tests skip Atlas integration. The opt-in test uses a unique disposable database; optional `MONGODB_TEST_URI` separates the test cluster.

Coverage: BFS paths, forward/branch/reverse matching, fares, capacity/concurrency, stop order, ownership, chat cleanup/reconnect, payment/review, auth/OTP/Admin/photos. Automated integration is not a full manual three-browser demo.

| Where                                       | Main responsibility                  |
| ------------------------------------------- | ------------------------------------ |
| `backend/utils/rideRules.js`                | Graph, BFS, matching, seats, fare    |
| `backend/controllers/rideController.js`     | Transactions, lifecycle, payment     |
| `backend/models/Pool.js` / `RideRequest.js` | Snapshots, membership, history       |
| `backend/services/rideChatService.js`       | Private temporary chat               |
| `frontend/src/RidePanels.jsx`               | Map, offers, individual ride actions |

**Boundaries:** no live GPS, real payments, traffic routing or guaranteed one-second matching. Offers inspect up to 200 candidates. Old completed history remains; older active pools finish without accepting new graph bookings. ERD/system design is a separate next step.
