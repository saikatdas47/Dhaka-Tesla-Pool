# Run and deploy the combined app

The frontend and backend use one server and one URL. Express serves the generated files in `backend/public`. MongoDB stays on Atlas. Socket.IO and cookie authentication use the same origin, so no separate frontend URL or CORS configuration is needed.

## Build locally

From the project folder:

```sh
npm ci --prefix frontend
npm ci --prefix backend
npm run build
npm start
```

Open `http://localhost:4000` if `PORT=4000` in `backend/.env`. The build command generates `backend/public/index.html`, `assets/`, and the default avatar. Edit React files in `frontend/src`, not generated files in `backend/public`. Run `npm run build` again after editing React code.

The generated folder is ignored by Git. Render generates it during every deployment.

Docker remains available:

```sh
docker compose up --build
```

The Dockerfile independently builds React and copies it into the container's `public` folder.

## Render setup

1. Push the source changes to your GitHub repository. Never commit `backend/.env`.
2. In Render, select **New → Web Service** and connect the repository.
3. Select the branch you want to deploy. Leave **Root Directory** empty (repository root).
4. Choose **Node** runtime.
5. Set **Build Command**:

   ```sh
   npm ci --prefix frontend && npm ci --prefix backend && npm run build
   ```

6. Set **Start Command** to `npm start`.
7. Set **Health Check Path** to `/health`.
8. Set the environment variables below in Render, then deploy. Let Render supply `PORT`; do not force port 4000 there.
9. Copy the service's outbound IP ranges from Render into Atlas **Network Access**. Do not open Atlas to every IP merely for convenience.
10. Open the generated `https://...onrender.com` URL. Check `/health`, login, direct `/passenger/history` navigation, and chat reconnect.

## Environment variables

Copy your existing secret values privately from `backend/.env` into Render:

| Variable                | Value or purpose                                                             |
| ----------------------- | ---------------------------------------------------------------------------- |
| `NODE_ENV`              | `production`                                                                 |
| `COOKIE_SECURE`         | `true` for HTTPS                                                             |
| `MONGODB_URI`           | Your Atlas connection string                                                 |
| `MONGODB_DB_NAME`       | `dhaka_tesla_pool` or your chosen database                                   |
| `JWT_SECRET`            | Existing secret, at least 32 bytes                                           |
| `AccessTokenSecret`     | Different secret, at least 32 bytes                                          |
| `RefreshTokenSecret`    | Different secret, at least 32 bytes                                          |
| `AccessTokenExpiresIn`  | `15m`                                                                        |
| `RefreshTokenExpiresIn` | `7d`                                                                         |
| `OTP_SECRET`            | Existing OTP secret, at least 16 characters                                  |
| `EMAIL_USER`            | Existing Gmail sender                                                        |
| `EMAIL_APP_PASSWORD`    | Existing Gmail app password                                                  |
| `EMAIL_FROM_NAME`       | `Dhaka Tesla Pool`                                                           |
| `CLOUDINARY_CLOUD_NAME` | Existing Cloudinary cloud name                                               |
| `CLOUDINARY_API_KEY`    | Existing Cloudinary key                                                      |
| `CLOUDINARY_API_SECRET` | Existing Cloudinary secret                                                   |
| `ADMIN_USERNAME`        | Existing admin username                                                      |
| `ADMIN_PASSWORD`        | Existing admin password, at least 16 characters                              |
| `ENABLE_DEMO_ACCOUNTS`  | `false` for real use; `true` only for an intentionally public evaluator demo |
| `ENABLE_ADMIN_AUTOFILL` | `false`; admin passwords are never exposed in production                     |

Do not add `MONGODB_TEST_URI` or `RUN_ATLAS_INTEGRATION` to the live service. `UPLOAD_DIR` is optional; the default is `uploads`.

## Important free-tier limitations

- Render Free blocks outbound SMTP ports 25, 465 and 587. The current Gmail/Nodemailer OTP sender therefore cannot work on Render Free. Existing-account login still works, but new signup needs OTP. For a fully functional free deployment, choose an HTTPS email API and adapt the sender; the email-verification requirement must not be bypassed. No provider has been selected or integrated by this change.
- The free filesystem is temporary. Successful uploads live on Cloudinary, but failed uploads kept locally for retry may be lost on restart/redeploy. The existing retry handler clears a missing local file and asks the user to select it again. Guaranteed retry persistence needs durable storage, which is a separate choice.
- Free web services sleep after inactivity. The first request can be slow, and deployments/restarts disconnect sockets. Chat reconnects and reloads messages still available before driver arrival.

Sources: [Render Free](https://render.com/docs/free), [Node/Express deployment](https://render.com/docs/deploy-node-express-app), [WebSockets](https://render.com/docs/websocket), [outbound IP addresses](https://render.com/docs/outbound-ip-addresses).
