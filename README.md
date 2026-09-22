# Dhaka Tesla Pool

The repository currently contains a minimal Express API connected to MongoDB Atlas. The frontend directory is empty, so Compose starts only the API. Add a frontend service when the frontend app exists.

## Run with Docker

1. Install Docker Desktop and start it.
2. Copy `backend/.env.example` to `backend/.env`.
3. Replace `MONGODB_URI` in `backend/.env` with your MongoDB Atlas driver connection string. Set the database name to `dhaka_tesla_pool` or your preferred name.
4. In Atlas, create a database user and allow your current network address under Network Access. URL-encode special characters in the database password.
5. From the repository root, run `docker compose up --build`.
6. Check `http://localhost:4000/health`. A successful response is `{"status":"ok","database":"connected"}`.

The Atlas URI stays in `backend/.env`, which Git ignores and Docker excludes from the image. Compose supplies it to the running container. The API waits for an Atlas connection before it opens port 4000; a failed connection exits with a readable error in `docker compose logs api`.

Stop with `docker compose down`. No database container or local database volume is used because the database is hosted on Atlas.
