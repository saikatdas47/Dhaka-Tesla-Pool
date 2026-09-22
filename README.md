# Dhaka Tesla Pool

Current scope: passenger registration, login, a protected home page, and logout. Ride booking and driver features are not implemented yet. The React frontend and Express API are served from one Docker container; MongoDB Atlas stores passengers.

## Docker setup

1. Start Docker Desktop.
2. If `backend/.env` does not exist, copy `backend/.env.example` to `backend/.env`.
3. In `backend/.env`, set `MONGODB_URI` to your Atlas connection string. The app selects the `dhaka_tesla_pool` database by default; set `MONGODB_DB_NAME` if you prefer another name. Create an Atlas database user and allow your current network address in Atlas Network Access. URL-encode special characters in the password.
4. Set `JWT_SECRET` to a unique random value of at least 32 bytes. You can generate one with `openssl rand -hex 32`.
5. From the project root, run `docker compose up --build`.
6. Open `http://localhost:4000`. Register, then use the home page. Log out and sign in with the same account.

`backend/.env` is ignored by Git and excluded from the Docker image. Docker Compose gives these values to the running container. The API starts only after it connects to MongoDB Atlas.

Useful commands from the project root:

```bash
docker compose up --build
docker compose logs -f api
docker compose down
```

After changing code, run `docker compose up --build` again to rebuild the image. The current Compose setup does not hot reload. The health endpoint is `http://localhost:4000/health`.

## Files and request flow

- `frontend/src/App.jsx`: registration form, login form, home page, and session check.
- `backend/routes/passengerRoutes.js`: passenger authentication route definitions.
- `backend/controllers/passengerController.js`: registration, login, current passenger, and logout logic.
- `backend/models/Passenger.js`: MongoDB passenger model. Passwords are stored as bcrypt hashes.
- `backend/index.js`: Express app, API routes, frontend static files, and Atlas startup.

The browser sends registration or login details to `/api/passengers/*`. The API verifies the request, stores or finds the passenger in Atlas, and sets a signed HTTP-only cookie. The browser then calls `/api/passengers/me` to restore the session after a refresh. The home page is available only while signed in.
