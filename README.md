# Dhaka Tesla Pool

Current scope: Passenger and Driver accounts, email OTP, protected dashboards, profile photos, manual driver approval, area-based ride pooling, and simulated payment records. The React frontend and Express API are served from one Docker container; MongoDB Atlas stores accounts, ride requests, and pools.

## Ride MVP design

The driver has **2–4 passenger seats** and starts offline. An admin-approved driver chooses a current Dhaka area and goes online; only then do requests from that pickup area appear. Passengers see available online drivers on a schematic area map. The blue ring on an active ride shows the assigned driver's **last manually selected area**, not live GPS. The UI refreshes every 10 seconds. No GPS permission or map API is used.

Areas: Banani, Gulshan 1, Mohakhali, Dhanmondi, Mirpur, Uttara, Farmgate, and Bashundhara. The driver accepts the first waiting request. Other waiting requests with the same pickup area and destinations on a shared corridor join automatically up to the remaining capacity; compatible requests made later also join automatically before the driver marks arrival. Full pools leave later requests waiting. The rule is in `backend/utils/rideRules.js`; it is not route optimization. A driver has at most one active pool. Matching runs during the API requests, but no one-second response-time guarantee is claimed.

Passenger flow: estimate fare → choose Cash or simulated TeslaPay → request 1–4 seats → wait/match → see arrival/start/completion and history; cancel before the trip starts. Driver flow: select area → go online → see compatible offers → accept the first request and automatically fill compatible seats → mark arrived → start → complete → see history and confirm cash received. Only the assigned driver can advance a pool or confirm its cash payments. Each passenger sees only their own request and fare.

Fare is stored as integer **paisa** (100 paisa = ৳1). Admins set the base fare, per-kilometre rate, and shared-pool discount in **Admin Panel → Fare settings**; these rates are stored in MongoDB. Until an admin saves rates, initial demo defaults are ৳50, ৳20/km and 20%. The deterministic estimate is `(base fare + per-km rate × rounded kilometres) × requested seats`. The distance is a straight-line approximation between fixed area centres rounded to a whole kilometre, with a 1 km minimum; it is not road distance. These are MVP assumptions, not official or live prices. A pool with at least two passenger requests gets the configured discount off each passenger's fare; otherwise the solo estimate applies. With the initial defaults, one seat for Banani → Mohakhali or Banani → Gulshan 1 estimates ৳90 solo or ৳72 when shared. The server recalculates the fare using the current rates when a ride is requested, so a previously displayed estimate may change if an admin updates rates before booking. Each created ride stores its own solo fare, shared fare, and rate snapshot; later admin changes do not reprice it. The final fare is frozen on completion. Cash becomes **due** at completion and the assigned driver marks it **paid** when received. Simulated TeslaPay becomes **paid** at completion without moving real money or maintaining a wallet balance. Method, status, amount, payment time, and events remain in the ride history. Older rides without payment data show **not recorded**.

`RideRequest` stores the passenger, name/route/seat/fare snapshots, status, pool link, and status history. `Pool` stores the driver/vehicle snapshot, 2–4-seat capacity, occupied seats, member snapshots, and status plus membership-event history. Changing a profile later does not rewrite a past trip. A unique partial index limits each passenger to one active request and each driver to one active pool. Adding a member checks remaining capacity in an atomic conditional update, while a MongoDB transaction updates the related request and pool together. This prevents two concurrent accepts from claiming the same last seat.

Passenger routes: `/passenger` (current ride), `/passenger/profile`, and `/passenger/history`. Driver routes: `/driver` (availability, offers, active pool), `/driver/profile`, and `/driver/history`. The name/avatar menu links to Dashboard, Your Profile, History, and Log out. History uses paged completed/cancelled records; no edit form is shown there. The driver's current area has a manual source and update time, separate from the usual service area. The passenger map is still an area-level schematic, not a live map.

Run the usual suite with `docker compose exec api npm test`. The isolated Atlas flow, three-seat concurrent-last-seat, fare, cancellation, and simulated-payment test runs with `docker compose exec -e RUN_ATLAS_INTEGRATION=true api node --test tests/ride.integration.test.js`; it creates and removes only its randomly named test database. That test requires a working Atlas test URI or the configured Atlas cluster.

Not included: real payments, live GPS, routing optimization, chat, ratings, push notifications, or real-time sockets. The schematic map is not a navigational map. Demo driver approval must be done in the Admin Panel before going online.

## Docker setup

1. Start Docker Desktop.
2. If `backend/.env` does not exist, copy `backend/.env.example` to `backend/.env`.
3. In `backend/.env`, set `MONGODB_URI` to your Atlas connection string. The app selects the `dhaka_tesla_pool` database by default; set `MONGODB_DB_NAME` if you prefer another name. Create an Atlas database user and allow your current network address in Atlas Network Access. URL-encode special characters in the password.
4. Set `JWT_SECRET`, `AccessTokenSecret`, and `RefreshTokenSecret` to three **different** random values of at least 32 bytes. Generate each with `openssl rand -hex 32`. The old `JWT_SECRET` is kept temporarily for previously issued sessions. Set `AccessTokenExpiresIn=15m` and `RefreshTokenExpiresIn=7d` (supported units: `m`, `h`, `d`).
5. Set `EMAIL_USER`, `EMAIL_APP_PASSWORD`, `EMAIL_FROM_NAME`, and a random `OTP_SECRET` (at least 16 characters) for Gmail email verification. For profile photos, set the `CLOUDINARY_*` values in the same `.env` file.
6. For local demo buttons, set `ENABLE_DEMO_ACCOUNTS=true`. This deliberately creates two accounts with public test passwords; **turn it off for any shared or deployed environment**. Docker Compose binds port 4000 only to your computer's localhost.
   Set `ADMIN_USERNAME` and a unique `ADMIN_PASSWORD` of at least 16 characters in the ignored `backend/.env` file. Open `http://localhost:4000/admin` for the Admin Panel. For this local demo, `ENABLE_ADMIN_AUTOFILL=true` adds a button that fills those credentials. **Anyone able to access the local app can retrieve the admin password while this is enabled.** Set it to `false` before sharing or deploying; production mode disables the endpoint regardless. Never commit the real password.
7. From the project root, run `docker compose up --build`.
8. Open `http://localhost:4000`. Choose Passenger or Driver on registration and login.

`backend/.env` is ignored by Git and excluded from the Docker image. Docker Compose gives these values to the running container. The web page starts even if Atlas is temporarily unavailable; database routes return HTTP 503 until the connection succeeds. The app retries Atlas every 10 seconds, so no rebuild is needed after fixing Atlas access.

Useful commands from the project root:

```bash
docker compose up --build
docker compose logs -f api
docker compose down
```

After changing code, run `docker compose up --build` again to rebuild the image. The current Compose setup does not hot reload. The health endpoint is `http://localhost:4000/health`.

## Passenger and Driver accounts

Passenger and Driver are separate accounts and MongoDB collections. Each role has its own email, username, password, and session cookie. The same email or username may exist once in each role, but duplicates within one role are rejected. Sign in with that role's email **or** username plus password. Signing in as one role ends the other role's session, and logout clears both role sessions. Older Passenger accounts without a username can still sign in with email.

Driver registration asks for a phone number, driving licence number and expiry, Tesla model, vehicle registration, color, 2–4 passenger seats, and usual service area. The usual service area is a profile field; the driver separately selects their current area for matching. A new driver is **verification pending** until the project admin approves or rejects the submitted information at `/admin`. Changing licence or vehicle details returns an approved driver to pending review. This is a manual review of submitted fields, not an automated licence check.

Passenger registration requires a Bangladesh mobile number. Existing Passenger records without one remain readable and show "Not set" on the Profile page. Passengers can edit their name; Drivers can edit their name, phone, licence, and Tesla details. Username and email cannot be edited. Both roles can upload, replace, or remove their profile photo from **Your Profile**. `DELETE /api/passengers/avatar` and `DELETE /api/drivers/avatar` remove the Cloudinary photo before clearing the saved reference. The Admin Panel has **Driver review** for pending/unverified applications, **Drivers** for all driver accounts, and **Passengers** for passenger accounts. Driver rows open a full profile and verification history. Admins can approve/reject pending or unverified drivers, or mark approved/rejected drivers unverified. Drivers can be searched by username, licence, name, or email and filtered by 2, 3, or 4 passenger seats. The driver list API is `GET /api/admin/drivers?q=...&field=username|licence|name|email|all&seats=2|3|4&page=1`; review requests are at `GET /api/admin/drivers/pending?page=1`. Passenger rows open only account information (name, username, email, phone, photo, email verification and join date), never ride history or authentication secrets. Passenger search is `GET /api/admin/passengers?q=...&field=username|name|email|phone|all&page=1`; details are at `GET /api/admin/passengers/:id`. Both endpoints require the admin session.

## Email verification and tokens

New Passenger and Driver signups require a six-digit email code. `POST /api/email-otp/send` accepts `{ role, email }`; `POST /api/email-otp/verify` accepts `{ role, email, otp }` and returns a short-lived `registrationToken`. The signup form sends that token to its role's `/register` route. Codes last `5 * 60 * 1000` milliseconds, resend has a `60 * 1000` millisecond cooldown, and five wrong attempts invalidate a code. OTP records live in MongoDB; they survive an app restart until their expiry. Existing accounts can still log in without repeating signup verification.

Login creates a short-lived access token and a rotating refresh token. Both use HTTP-only, SameSite=Lax cookies; the access token is also returned in the API response for clients using `Authorization: Bearer <accessToken>`. The role-specific `POST /api/passengers/refresh-token` or `/api/drivers/refresh-token` route rotates the refresh token and issues a new access token. The browser refreshes automatically when a protected request returns 401. Logout revokes the current refresh token and clears both cookies. Only a hash of the refresh token is stored in MongoDB.

When local demos are enabled, the login page shows **Use Passenger demo** and **Use Driver demo**. Clicking either button fills in the corresponding username and password; then click **Sign in**. Demo accounts bypass signup OTP only when seeded locally. Do not enable the demo setting on a public deployment.
Additional local demo users are `demo_nusrat`, `demo_rafiq`, and `demo_shirin` (Passenger; password `DemoPassenger2026!`) and `demo_jashim`, `demo_karim`, and `demo_farhana` (Driver; password `DemoDriver2026!`). Jashim starts approved with three passenger seats, Karim is pending, and Farhana is rejected. The seed checks each username and does not reset existing profiles or verification decisions on restart.
Demo records remain in Atlas after the setting is turned off, but the application then rejects demo login and protected access.

## Profile photo flow

Passenger and Driver Profile pages accept one JPG, PNG, or WebP file up to 5 MB. Authenticated `/api/passengers/avatar` and `/api/drivers/avatar` routes save it in the private `uploads` directory. When replacing a picture, the old Cloudinary image is removed before the new upload begins. After upload succeeds, MongoDB gets the new secure URL and the local file is removed. If Cloudinary fails, the local file and pending filename remain; **Retry saved photo** calls the matching `/avatar/retry` route. A pending file belongs to its authenticated account and cannot be downloaded from the public frontend.

Docker stores pending files in the `passenger_uploads` named volume. `docker compose down` keeps this volume; `docker compose down --volumes` deletes it and any pending images, so avoid that command while an upload awaits retry.

## Files and request flow

- `frontend/src/App.jsx`: registration/login, admin panel, protected routes, and session checks.
- `frontend/src/RolePages.jsx`: Passenger/Driver header menu, Dashboard, and Profile pages.
- `backend/app.js`: Express middleware, routes, static frontend, and errors.
- `backend/index.js`: MongoDB connection and server startup.
- `backend/middlewares/auth.middleware.js`: checks session token, role, expiration, and account for protected routes.
- `backend/middlewares/multer.middleware.js`: accepts one image and saves it locally.
- `backend/routes/passengerRoutes.js`: passenger route definitions.
- `backend/controllers/passengerController.js`: registration, login, photo upload/retry, and logout logic.
- `backend/services/avatarService.js`: file signature check, Cloudinary upload, and local cleanup.
- `backend/utils/cloudinary.js`: Cloudinary SDK setup and remote image calls; it never removes the local retry copy.
- `backend/models/Passenger.js`: MongoDB passenger model. Passwords are stored as bcrypt hashes.
- `backend/models/Driver.js`: separate MongoDB driver model with licence and vehicle fields.
- `backend/models/RideRequest.js` and `backend/models/Pool.js`: passenger requests and capacity-controlled shared trips.
- `backend/utils/rideRules.js` and `backend/controllers/rideController.js`: fixed-area matching, fare estimate, and ride lifecycle.
- `frontend/src/RidePanels.jsx`: Passenger and Driver ride controls, separate History view, and schematic area map.
- `backend/routes/driverRoutes.js` and `backend/controllers/driverController.js`: Driver signup, login, current profile, and logout.
- `backend/models/EmailOtp.js`, `backend/services/emailOtpService.js`, and `backend/utils/mailer.js`: persistent OTP records, verification rules, and Gmail delivery.
- `backend/services/sessionService.js`: access-token verification, refresh rotation, and logout revocation.

The browser sends registration or login details to `/api/passengers/*` or `/api/drivers/*`. The API uses only the selected role's collection and sets that role's signed HTTP-only cookie. The browser calls the matching `/me` route to restore the session after a refresh. One role's token cannot open the other role's protected API.
