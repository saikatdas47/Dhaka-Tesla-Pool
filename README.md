# Dhaka Tesla Pool

Current scope: separate Passenger and Driver registration/login, email OTP verification, access/refresh tokens, protected home pages, profile editing, profile photos, admin driver review, and logout. Ride booking is not implemented yet. The React frontend and Express API are served from one Docker container; MongoDB Atlas stores each role in its own collection.

## Docker setup

1. Start Docker Desktop.
2. If `backend/.env` does not exist, copy `backend/.env.example` to `backend/.env`.
3. In `backend/.env`, set `MONGODB_URI` to your Atlas connection string. The app selects the `dhaka_tesla_pool` database by default; set `MONGODB_DB_NAME` if you prefer another name. Create an Atlas database user and allow your current network address in Atlas Network Access. URL-encode special characters in the password.
4. Set `JWT_SECRET`, `AccessTokenSecret`, and `RefreshTokenSecret` to three **different** random values of at least 32 bytes. Generate each with `openssl rand -hex 32`. The old `JWT_SECRET` is kept temporarily for previously issued sessions. Set `AccessTokenExpiresIn=15m` and `RefreshTokenExpiresIn=7d` (supported units: `m`, `h`, `d`).
5. Set `EMAIL_USER`, `EMAIL_APP_PASSWORD`, `EMAIL_FROM_NAME`, and a random `OTP_SECRET` (at least 16 characters) for Gmail email verification. For profile photos, set the `CLOUDINARY_*` values in the same `.env` file.
6. For local demo buttons, set `ENABLE_DEMO_ACCOUNTS=true`. This deliberately creates two accounts with public test passwords; **turn it off for any shared or deployed environment**. Docker Compose binds port 4000 only to your computer's localhost.
   Set `ADMIN_USERNAME` and a unique `ADMIN_PASSWORD` of at least 16 characters in the ignored `backend/.env` file. Open `http://localhost:4000/admin` for the Admin Panel. The generated local admin password is in `backend/.env`; do not commit it.
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

Driver registration asks for a phone number, driving licence number and expiry, Tesla model, vehicle registration, color, passenger-seat count, and usual service area. The service area is text, not live GPS location. A new driver is **verification pending** until the project admin approves or rejects the submitted information at `/admin`. Changing licence or vehicle details returns an approved driver to pending review. This is a manual review of submitted fields, not an automated licence check. Ride offers are not implemented yet.

Passenger registration now requires a Bangladesh mobile number. Existing Passenger records without one remain readable and show "Not set" on the dashboard. Both dashboards have an **Edit profile** button. Passengers can update only their name via `PATCH /api/passengers/me`. Drivers can update their name, phone, licence, and Tesla details via `PATCH /api/drivers/me`. Username and email cannot be edited. Both dashboards allow an avatar upload or replacement. The Admin Panel has Overview, Statistics, and Driver review sections; its counts come from MongoDB.

## Email verification and tokens

New Passenger and Driver signups require a six-digit email code. `POST /api/email-otp/send` accepts `{ role, email }`; `POST /api/email-otp/verify` accepts `{ role, email, otp }` and returns a short-lived `registrationToken`. The signup form sends that token to its role's `/register` route. Codes last `5 * 60 * 1000` milliseconds, resend has a `60 * 1000` millisecond cooldown, and five wrong attempts invalidate a code. OTP records live in MongoDB; they survive an app restart until their expiry. Existing accounts can still log in without repeating signup verification.

Login creates a short-lived access token and a rotating refresh token. Both use HTTP-only, SameSite=Lax cookies; the access token is also returned in the API response for clients using `Authorization: Bearer <accessToken>`. The role-specific `POST /api/passengers/refresh-token` or `/api/drivers/refresh-token` route rotates the refresh token and issues a new access token. The browser refreshes automatically when a protected request returns 401. Logout revokes the current refresh token and clears both cookies. Only a hash of the refresh token is stored in MongoDB.

When local demos are enabled, the login page shows **Use Passenger demo** and **Use Driver demo**. Clicking either button fills in the corresponding username and password; then click **Sign in**. Demo accounts bypass signup OTP only when seeded locally. Do not enable the demo setting on a public deployment.
Demo records remain in Atlas after the setting is turned off, but the application then rejects demo login and protected access.

## Profile photo flow

Passenger and Driver home pages accept one JPG, PNG, or WebP file up to 5 MB. Authenticated `/api/passengers/avatar` and `/api/drivers/avatar` routes save it in the private `uploads` directory. When replacing a picture, the old Cloudinary image is removed before the new upload begins. After upload succeeds, MongoDB gets the new secure URL and the local file is removed. If Cloudinary fails, the local file and pending filename remain; **Retry saved photo** calls the matching `/avatar/retry` route. A pending file belongs to its authenticated account and cannot be downloaded from the public frontend.

Docker stores pending files in the `passenger_uploads` named volume. `docker compose down` keeps this volume; `docker compose down --volumes` deletes it and any pending images, so avoid that command while an upload awaits retry.

## Files and request flow

- `frontend/src/App.jsx`: role-specific registration/login, Passenger and Driver home pages, and session checks.
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
- `backend/routes/driverRoutes.js` and `backend/controllers/driverController.js`: Driver signup, login, current profile, and logout.
- `backend/models/EmailOtp.js`, `backend/services/emailOtpService.js`, and `backend/utils/mailer.js`: persistent OTP records, verification rules, and Gmail delivery.
- `backend/services/sessionService.js`: access-token verification, refresh rotation, and logout revocation.

The browser sends registration or login details to `/api/passengers/*` or `/api/drivers/*`. The API uses only the selected role's collection and sets that role's signed HTTP-only cookie. The browser calls the matching `/me` route to restore the session after a refresh. One role's token cannot open the other role's protected API.
