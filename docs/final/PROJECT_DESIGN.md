# Dhaka Tesla Pool — current project design

This folder is the **current implementation reference**. It describes the running MongoDB Atlas MVP, not an unimplemented redesign. The companion diagrams are [system-architecture.eraserdiagram](./system-architecture.eraserdiagram) and [data-model.eraserdiagram](./data-model.eraserdiagram). For field-level schema rules, see [DATA_MODEL.md](./DATA_MODEL.md). Earlier drafts and the proposed `FarePolicy` migration are preserved in [../archive](../archive/).

## Actors and runtime

- **Passenger:** registers/signs in, requests 1–4 seats, sees own estimate, status, payment and history, cancels while allowed, and reviews a Driver after a completed ride.
- **Driver:** registers/signs in, is manually approved by Admin, selects a current area, goes online/offline, sees compatible requests, accepts a pool, marks arrival/start/completion, confirms Cash received, and sees own trip history and reviews.
- **Admin:** signs in using environment-configured credentials, reviews Driver applications/accounts, sees limited Passenger account details (not their ride history), and sets fare rates.
- **Runtime:** one Docker container serves the React SPA, Express REST API and Socket.IO. MongoDB Atlas stores accounts, rides, pools, fare settings, short-lived OTP/chat records and persistent reviews. Cloudinary stores profile photos; SMTP delivers OTP. Compose does not run a local MongoDB container.

## Matching, seats and lifecycle

Drivers have 2–4 passenger seats. Only approved, online Drivers with a manually selected current area see requests from that pickup area. The first accepted request creates a Pool; compatible requests with the same pickup and a shared corridor can join before arrival. This is deterministic area matching, not real routing or a guaranteed one-second service level. An atomic conditional Pool update and MongoDB transaction reserve seats and update the related request together; occupied seats must not exceed capacity.

`REQUESTED → MATCHED → DRIVER_ARRIVED → STARTED → COMPLETED`, with `CANCELLED` only from permitted earlier states. Passenger history comes from their RideRequests; Driver history comes from their Pools. Status timestamps and snapshots remain on those records after completion.

## Fare, payment, chat and reviews

Admin controls base fare, per-kilometre rate and shared discount through one current `FareSettings` document. The defaults are ৳50 + ৳20 per approximate kilometre, with 20% discount when requests actually share a Pool. Distance comes from fixed Dhaka area centres, rounded to whole kilometres with a 1 km minimum—not road distance. The solo quote is `(base + km × rate) × seats`; each pooled Passenger's fare applies the discount to their own solo quote. Money is stored as integer paisa, and each RideRequest keeps the rate snapshot and final fare. Cash is due at completion until the assigned Driver confirms receipt; TeslaPay is simulated paid at completion, with no real wallet/gateway.

Each matched Passenger has a separate private Socket.IO chat with the assigned Driver. Messages persist temporarily in Atlas across refreshes and are deleted when the Driver marks arrival or that request is cancelled. After a completed trip, the Passenger can submit one 1–5-star DriverReview for that RideRequest. Driver and Admin views show the Passenger name, rating and comment—not the Passenger's email, phone or other ride history.

## Security and deliberate limits

Passenger and Driver are separate account collections/login domains. Access and rotating refresh tokens use HTTP-only cookies; server middleware checks roles and ownership. Each socket connection and message is authorized against the ride membership. OTP and chat records expire; completed ride and review records are retained. There is no live GPS, real payment gateway, route optimization, push notification or public deployment claim here.

The source of truth for exact API behavior and validations remains `backend/`. If the implementation changes, update this document and its diagrams in the same change.
