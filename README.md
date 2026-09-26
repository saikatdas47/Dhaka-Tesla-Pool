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

Money is stored as **integer paisa**: 100 paisa = ৳1. Admin controls base fare, per-km rate and shared discount.

Default demo rates: **৳50 base + ৳20/km; shared discount 20%**.

```text
soloPaisa = (basePaisa + distanceKm × perKmPaisa) × seats
sharedPaisa = round(soloPaisa × (100 − discountPercent) / 100)

Bookings A and B share a segment when:
A.pickupIndex < B.destinationIndex
AND B.pickupIndex < A.destinationIndex

finalFare = shared fare if another non-cancelled booking overlaps;
            otherwise solo fare
```

| Journey                       | Distance | Solo calculation          | Shared |
| ----------------------------- | -------: | ------------------------- | -----: |
| Banani → Gulshan 1, 1 seat    |     2 km | 50 + 2 × 20 = ৳90         |    ৳72 |
| Banani → Mohakhali, 1 seat    |     4 km | 50 + 4 × 20 = ৳130        |   ৳104 |
| Dhanmondi → Motijheel, 1 seat |     9 km | 50 + 9 × 20 = ৳230        |   ৳184 |
| Mirpur → Mohakhali, 2 seats   |    10 km | (50 + 10 × 20) × 2 = ৳500 |   ৳400 |

**Overlap example:** A travels Mirpur → Mohakhali; B travels Farmgate → Bashundhara. They share Farmgate → Mohakhali, so the whole booking gets the simple 20% discount. A ending at Mohakhali and B starting there have no shared segment: **no discount**.

This is accepted-booking overlap—not GPS-measured shared distance. Rates/path are saved as snapshots; acceptance recalculates assigned distance using saved rates. New pricing does not rewrite old rides. Final fare freezes at completion.

**Cash:** due after drop-off; Driver confirms receipt. **TeslaPay:** simulated auto-payment, no real gateway or wallet balance.

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
