# Dhaka Tesla Pool

Share a seat. Split the fare. Survive Dhaka traffic.

## The problem and our solution

A 2–4-seat vehicle can serve several Passengers travelling along the same forward path, even when they board and leave at different areas. We must find compatible journeys, prevent overbooking, keep individual fares/statuses private and preserve a useful ride history.

The map is now a **weighted graph**, not three selectable corridors. Passenger pickup/destination determines a shortest path. The first Driver acceptance creates a pool; later accepted bookings may use its forward path or extend its end without changing existing Passenger paths.

This is a showcase MVP. There is **no live GPS**: Driver pickup/drop-off buttons declare progress. BFS finds the unique tree path; its edge distances determine fare, not real travel time or road navigation. System architecture/ERD will be discussed separately; deleted design documents are not restored.

## Actors and features

- Passenger: OTP signup, email-or-username login, pickup/destination/seats, estimate, request/cancel, own status/fare/history, private chat and post-trip review.
- Driver: approved login, initial starting area, online/offline, individually accept compatible bookings, preview extension, per-Passenger arrival/pickup/drop-off, cash confirmation and history.
- Admin: Driver verification, Driver/Passenger account details, review display and fare rules.
- One React + Express + Socket.IO app container; MongoDB Atlas persists accounts, bookings, pools, OTPs, pricing, temporary chats and reviews.

Real payments, live GPS, routing services, push notifications and a real wallet balance are not implemented. Matching is synchronous during API calls; no universal one-second performance guarantee is claimed.

## Weighted graph

Each listed area is a node. Each undirected edge is a direct permitted connection with a positive distance in kilometres:

| Edge                  | Demo km |
| --------------------- | ------: |
| Dhanmondi ↔ Farmgate  |       3 |
| Farmgate ↔ Mohakhali  |       3 |
| Mohakhali ↔ Gulshan 1 |       2 |
| Gulshan 1 ↔ Banani    |       2 |
| Banani ↔ Bashundhara  |       4 |
| Mirpur ↔ Agargaon     |       4 |
| Agargaon ↔ Farmgate   |       3 |
| Banani ↔ Uttara       |       8 |
| Farmgate ↔ Shahbag    |       3 |
| Shahbag ↔ Motijheel   |       3 |

These are explicit invented demo distances, not measured road distances. The current graph is connected and tree-shaped, so every pair has one simple path. BFS is sufficient for this unique-path map. A cyclic test explicitly demonstrates that BFS does not minimize weighted distance.

Every listed pickup/destination pair is supported. For example:

- Dhanmondi → Motijheel: Dhanmondi → Farmgate → Shahbag → Motijheel (9 km).
- Mirpur → Mohakhali: Mirpur → Agargaon → Farmgate → Mohakhali (10 km).
- Farmgate → Bashundhara: Farmgate → Mohakhali → Gulshan 1 → Banani → Bashundhara (11 km).

### BFS behind the scenes

The map is a connected tree: each pair has exactly one simple path. BFS uses a queue, marks each node visited once and records its predecessor. Starting at the destination, follow predecessors back to the pickup and reverse the result.

```text
queue = [pickup]
for each queued area:
    visit each unvisited neighbour
    record its previous area and edge distance
    append it to the queue

distanceKm = sum(edge distances along the reconstructed path)
```

Time and space are O(V + E). Queue traversal uses a head index rather than repeatedly shifting the array. Fixed edge order makes traversal deterministic. Positive finite distances are required for fare calculation; unreachable areas are rejected.

BFS is justified because this map is a tree, not because it finds the minimum weighted distance. On a cyclic graph BFS minimizes edge count, which can choose a longer-distance path. If alternative weighted roads are introduced, replace path finding with Dijkstra before using them in production. The exported name `shortestPath` is retained for existing callers; on this tree its unique path is also the shortest path.

Graph definitions and functions are in `backend/utils/rideRules.js`. No extra editable Route collection is necessary. Pool and RideRequest store path/distance snapshots so later graph changes do not rewrite completed history.

## First booking and initial location

Before a trip, Driver chooses a **starting area** and goes online. There is no Driver route, direction or destination selector.

Without an active pool, only requests whose pickup equals that starting area appear. Accepting one creates the initial path:

```text
poolPath = BFS(firstPassenger.pickup, firstPassenger.destination)
```

The Driver's destination is automatically the last stop of the pool path. The Driver explicitly accepts every booking; no waiting Passenger is added automatically.

During an active trip there is no manual location-update form. The API also rejects attempts to change currentArea independently.

## Forward matching and extension

Let T be the pool's ordered path, C its current progress index, P the new pickup index, and D the new destination index.

### Destination already on the path

```text
C ≤ P < D
```

Both stops must exist in T, and every required segment must have capacity.

### Destination outside the path

Compute:

```text
candidate = BFS(newPickup, newDestination)
remaining = T from newPickup through T's final stop
```

The candidate must begin with **all of remaining in the same order**. Only the candidate's extra tail may be appended. The tail cannot revisit any existing pool node.

This is a **path-prefix rule**, not mere reachability. A connected graph makes all destinations reachable, but most branches are incompatible with the assigned journey.

Examples:

| Existing pool                            | New request            | Result                                                                    |
| ---------------------------------------- | ---------------------- | ------------------------------------------------------------------------- |
| Dhanmondi → Farmgate → Mohakhali         | Farmgate → Gulshan 1   | Acceptable: candidate begins Farmgate → Mohakhali, then appends Gulshan 1 |
| Dhanmondi → Farmgate → Mohakhali         | Farmgate → Mirpur      | Rejected: turns to Agargaon before completing the remaining path          |
| Dhanmondi → Farmgate → Agargaon → Mirpur | Agargaon → Mohakhali   | Rejected: goes back to Farmgate                                           |
| Mirpur → Agargaon → Farmgate → Mohakhali | Farmgate → Bashundhara | Acceptable: appends Gulshan 1 → Banani → Bashundhara                      |
| Current progress is Mohakhali            | New pickup at Farmgate | Rejected: behind recorded progress                                        |

An extension preserves the full existing path as its prefix. It does not reroute existing Passengers. Driver sees a **Preview path** button, compatibility reason and added km before accepting. Existing path is blue, proposed tail orange.

If later graph revisions introduce shortcuts, an extended pool is not necessarily the globally shortest route from the original start to its new end: preserving assigned journeys takes priority. Each new booking's actual assigned path distance is recalculated at acceptance using its saved fare rates.

## Location and stop order

The Driver's location is a recorded declaration, not a measured coordinate:

- Before a trip: starting-area selection, source manual.
- On Passenger pickup: current area becomes that pickup, source trip-action.
- On Passenger drop-off: current area becomes that destination, source trip-action.
- Location and timestamp update in the same transaction as ride status.
- Mark arrived closes that Passenger's chat, but does not independently advance recorded location.
- New-offer filtering uses the pool's recorded progress index.

If the Driver physically passes a pickup but has not pressed the corresponding action, the system cannot know that. Stale progress is an intentional no-GPS limitation; no live-position accuracy is claimed.

Actions cannot move backwards or skip an earlier assigned pickup/onboard drop-off. The Driver handles earlier stops first. At a shared stop, drop off existing Passengers before boarding others if capacity is full.

After the final Passenger leaves, the pool ends and the Driver stays at that last recorded area. A new first booking can then start a new shortest path in **any direction**. Forward direction belongs to a pool's path, not permanently to an area.

Go offline is blocked while accepted bookings remain. Logout still ends authentication and stops new offers without deleting the assigned pool; approved Driver login can resume it online. Admin revocation stops new offers but assigned rides can still finish.

## Seat reservations and onboard capacity

For vehicle capacity K and a new booking requesting S seats, acceptance requires:

```text
reservedSeats[j] + S ≤ K for every segment P ≤ j < D
```

Accept reserves each required segment, including future pickups. Newly appended segments begin with zero reservations before adding that booking. Pre-boarding cancellation subtracts its reservations. Completed reservations remain as the travelled segment record and do not occupy later segments.

Onboard seats are different:

```text
on pickup: require onboardSeats + S ≤ K; then onboardSeats += S
on drop-off: onboardSeats -= S
```

A three-seat vehicle can accept three seats Mirpur → Mohakhali and three seats Mohakhali → Bashundhara. There are six booked seats across the journey, but only three per segment. The early Passengers must leave before the later ones board.

### Concurrency and integrity

A MongoDB Atlas transaction coordinates Driver locking, pool path/seat updates, booking assignment and chat creation. Every acceptance writes the Driver document, serializing it with another accept, availability change or graph-trip progress action. Conflicting pool writes are retried with fresh transaction data.

Two bookings competing for a final segment seat cannot both commit. The loser receives HTTP 409 and stays REQUESTED. Competing incompatible extensions are rechecked against the committed path; no route-tail overwrite or partial booking is allowed.

Unique partial indexes allow one active ride per Passenger and one active pool per Driver. Pool validation rejects negative, fractional or over-capacity segment counts. No distributed locks, Redis or message queues are introduced.

## Individual lifecycle

```text
REQUESTED → MATCHED → DRIVER_ARRIVED → STARTED → COMPLETED
REQUESTED / MATCHED / DRIVER_ARRIVED → CANCELLED
```

Each Passenger has separate status and timestamps. Arrival is at that Passenger's pickup. STARTED means that Passenger is onboard, not that everybody has boarded. Completion moves only that Passenger to History and freezes their fare.

Pool status is a summary: MATCHED before boarding, STARTED during travel, COMPLETED when all bookings finish, or CANCELLED if all cancel without a completed ride. Future compatible pickups can join a STARTED pool. Cancelled members remain in history; they do not qualify for shared fare.

Cancelling a booking releases seats but does not reroute the remaining accepted pool; an already agreed extension remains in the stored planned path until that pool ends.

## Fare formulas

All money is integer **paisa**, with 100 paisa = ৳1. UI displays two decimal places rather than silently rounding away paisa.

Admin settings default to base ৳50, per-km ৳20, shared discount 20%. These are demo prices, not official fares.

```text
distanceKm = sum(edge kilometres along Passenger's assigned path)
soloFarePaisa = (baseFarePaisa + distanceKm × perKmPaisa) × seats
sharedFarePaisa = round(soloFarePaisa × (100 - discountPercent) / 100)
```

The existing simple shared discount is retained: full booking discount if another non-cancelled accepted booking overlaps at least one segment at completion.

```text
A.pickupIndex < B.destinationIndex
AND B.pickupIndex < A.destinationIndex
```

This is an accepted-route-overlap discount, not GPS-proven shared occupancy or proportional shared-km pricing. Adjacent disjoint bookings do not receive it.

| One-seat journey       |  km | Solo | Shared |
| ---------------------- | --: | ---: | -----: |
| Banani → Gulshan 1     |   2 |  ৳90 |    ৳72 |
| Banani → Mohakhali     |   4 | ৳130 |   ৳104 |
| Dhanmondi → Motijheel  |   9 | ৳230 |   ৳184 |
| Mirpur → Mohakhali     |  10 | ৳250 |   ৳200 |
| Farmgate → Bashundhara |  11 | ৳270 |   ৳216 |

A request stores rate and shortest-path snapshots. Acceptance stores its actual assigned subpath and recomputes distance/estimates using those same rates. Existing bookings are not repriced when the pool extends. Estimated sharing can change before completion if another booking joins/cancels; final fare never changes after completion.

Cash becomes due at individual completion; assigned Driver confirms received Cash. Simulated TeslaPay becomes paid automatically without real money movement or a wallet balance.

## Chat, reviews and privacy

One private chat per booking—not per seat. Socket.IO delivers messages; temporary Atlas storage survives refresh/reconnect. Only assigned Driver and owning Passenger may join/send. Messages are 1–500 characters, at least 700 ms apart per socket, at most 200 per chat; a 30-day expiry is a fallback.

That Passenger's arrival or cancellation deletes their chat. Another Passenger's chat stays open even after the pool starts. Payment does not control chat closure.

After own completion, a Passenger may leave one integer 1–5 rating and 1–1000-character comment per ride. Driver Profile and Admin Driver detail show Passenger name, not private email/phone/history. Passenger history never exposes another Passenger's booking details.

## UI

Both roles use a two-thirds map and one-third form/control layout. Passenger selects any listed pickup/destination; shortest path appears automatically, with no corridor selector. Driver sees initial area controls only before a pool; active pool shows action-derived area and automatic destination.

Map displays every edge and its km weight, yellow pickup, purple destination, blue path, orange extension preview and green/grey online/offline Driver ring. Below the Driver map are offers, private chat cards and pool/member/segment actions. Ride status polls every 10 seconds; chat uses sockets.

## Stored information and compatibility

Driver stores current recorded area/source/time, not a manually chosen trip destination. Pool stores its graph version marker, full path/distance snapshot, recorded stop index, per-segment reservations, onboard count, Driver/vehicle snapshots and member/event history. RideRequest stores its own path, fares, stop indexes within the assigned pool, status/timestamps and payment events.

The internal routeCode value graph-v1 identifies the new routing version; it is not a selectable corridor. Older completed records remain readable. Older active pools retain their existing per-Passenger or legacy controls until they finish and cannot accept graph bookings. Unassigned older requests can be accepted into the graph flow; their path/fare is recalculated from their saved rates. No real ride/history records are deleted to upgrade the feature.

## Accounts, security and photos

Passenger and Driver usernames/emails are unique **within their own role**. Email or username plus password signs in to the selected role. Name/photo editing is allowed for Passengers; Drivers also edit phone/licence/vehicle details. Email/username stay read-only. New Drivers need manual Admin approval. Changing licence/vehicle details returns approval to pending; active capacity cannot be changed.

Access/refresh tokens use HTTP-only SameSite=Lax cookies. Refresh tokens rotate; only their hash is stored. Logout clears role sessions. Tabs share browser cookies: use separate browsers/profiles for simultaneous Passenger/Driver demos. Protected route guards and server authentication prevent logged-out Back navigation from retrieving protected data.

Signup OTP expires after 5 minutes, resend waits 60 seconds, and five wrong attempts invalidate a code. Existing login does not require repeated signup OTP.

Profile photos accept JPG/PNG/WebP up to 5 MB. Multer saves a private local file; replacing a photo first deletes the previous Cloudinary image. Successful upload saves the URL and removes the local file. Failure retains a retry file. Both roles can remove their photo; default avatar is used without one. Docker's named upload volume keeps pending files across container recreation.

Admin lists show account details and Driver verification/reviews, not Passenger ride history or authentication secrets.

## Run locally or with Docker

Set up the ignored `backend/.env` from `backend/.env.example`:

- Atlas MONGODB_URI; optional MONGODB_DB_NAME (default dhaka_tesla_pool). Allow the runtime's network address in Atlas.
- Different JWT_SECRET, AccessTokenSecret and RefreshTokenSecret values, each at least 32 bytes.
- AccessTokenExpiresIn=15m, RefreshTokenExpiresIn=7d.
- EMAIL_USER, EMAIL_APP_PASSWORD, EMAIL_FROM_NAME and OTP_SECRET for Gmail OTP.
- CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.
- ADMIN_USERNAME and ADMIN_PASSWORD (at least 16 characters).
- ENABLE_DEMO_ACCOUNTS=true only for an intentional local demo.
- ENABLE_ADMIN_AUTOFILL=true only locally: it exposes demo Admin credentials to anyone accessing the app. Production disables it.

Never commit real secrets.

From the repository root with Docker Desktop running:

```sh
docker compose up --build
```

Open http://localhost:4000. One application container serves React, Express and Socket.IO; the database is Atlas, not a local MongoDB container. Source edits require rebuilding.

Without Docker:

```sh
npm ci --prefix frontend
npm ci --prefix backend
npm run build
npm start
```

React builds into `backend/public`, served by Express. Edit `frontend/src`, not generated build files. Set PORT=4000 in the local backend .env if needed. Health: `GET /health`; unavailable database APIs return 503 while startup retries Atlas.

Render can use the repository root, Node runtime, build `npm ci --prefix frontend && npm ci --prefix backend && npm run build`, start `npm start`, and health path `/health`. Set NODE_ENV=production and COOKIE_SECURE=true; let Render supply PORT and allow its outbound addresses in Atlas. Current Gmail SMTP OTP is not compatible with Render Free's blocked SMTP ports; an HTTPS email provider is still needed for full signup there. Free ephemeral storage cannot guarantee failed-photo retry persistence. No public deployment is claimed.

## Demo walkthrough

Use separate browsers/profiles for simultaneous sessions. Tabs share cookies.

1. Driver starting area Mirpur → go online.
2. Passenger A requests Mirpur → Mohakhali. Driver accepts; path is Mirpur → Agargaon → Farmgate → Mohakhali.
3. Passenger B requests Farmgate → Bashundhara. Preview shows the orange tail after Mohakhali; Driver accepts.
4. Arrive/pick up A: A chat closes; Driver area becomes Mirpur.
5. Arrive/pick up B at Farmgate: B chat closes; area becomes Farmgate.
6. Drop A at Mohakhali: A finishes, own Cash becomes due, one seat becomes free; Driver area becomes Mohakhali.
7. Passenger C requests Gulshan 1 → Bashundhara. Driver can accept; new pickup is ahead and direction matches.
8. Pick up C at Gulshan 1, then drop B/C at Bashundhara. Pool ends; recorded area is Bashundhara.
9. Confirm Cash, view own History and submit review.
10. Start another trip from Bashundhara in a different direction; BFS computes its new path.

Also test Dhanmondi → Motijheel and rejection of Agargaon → Mohakhali in a Dhanmondi → Mirpur pool.

## Tests and verification

```sh
npm test
cd backend
RUN_ATLAS_INTEGRATION=true node --env-file=.env --test tests/ride.integration.test.js
```

The opt-in integration test writes only to a uniquely named temporary Atlas database and drops only that database. Use MONGODB_TEST_URI if needed. The usual command skips Atlas integration.

Production Docker omits test dependencies; a disposable test container can install them:

```sh
docker compose run --rm --entrypoint sh api -c 'npm ci --include=dev && npm test'
docker compose run --rm -e RUN_ATLAS_INTEGRATION=true --entrypoint sh api -c 'npm ci --include=dev && node --test tests/ride.integration.test.js'
```

Tests cover all area pairs, BFS tree paths, cyclic weighted-distance limitation, unreachable graph and invalid weights, forward prefixes, branch/reversal rejection, future pickups, no automatic acceptance, initial-area matching, extension, segment capacity, last-seat concurrency, stop ordering, automatic location, disjoint seat reuse, ownership, chat/reconnect/cleanup, fare, payment and reviews. Auth/Admin/OTP/photo tests remain separate.

On 26 September 2026 the graph-flow Atlas integration passed, including the Mirpur → Mohakhali / Farmgate → Bashundhara / Gulshan → Bashundhara scenario. Build and browser checks are reported separately; automated HTTP/Socket.IO checks are not claimed as a full three-browser manual demo.

## Code guide

| File                                            | Responsibility                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| backend/utils/rideRules.js                      | Graph, BFS, forward-prefix plan, segment reservations, fare/overlap             |
| backend/controllers/rideController.js           | Path preview, quote/request/offers, transactional accept/cancel/actions/payment |
| backend/controllers/driverController.js         | Accounts, idle starting-area selection, online/offline                          |
| backend/models/Pool.js / RideRequest.js         | Path/price snapshots, progress, capacity and status history                     |
| backend/services/rideChatService.js / socket.js | Private socket authorization and temporary messages                             |
| frontend/src/RidePanels.jsx                     | Weighted map, shortest-path preview, extension preview and per-booking controls |
| backend/tests/rideRules.test.js                 | Small hand-checkable graph and business-rule tests                              |
| backend/tests/ride.integration.test.js          | Isolated Atlas + HTTP + Socket.IO journey and concurrency tests                 |

## Limitations

No GPS accuracy, real traffic or actual road distances. Manual actions can lag physical movement. Offers inspect up to 200 waiting candidates from eligible pickups. The unique tree path is chosen; alternative weighted roads are not configured. A previously accepted extension is not shortened on cancellation. Shared discount represents accepted route overlap, not measured occupancy. Alternative weighted roads would require Dijkstra; larger datasets may need better candidate indexing.
