# min-rescue-backend

Express server that replaces Firebase Cloud Functions for the 10 Min Rescue / Suraksha Kavach project. Deployed free on Render so the project can stay on the Firebase Spark (free) plan.

## What this server does

| Endpoint | Purpose |
|----------|---------|
| `GET /` | Plain text health string |
| `GET /healthz` | JSON health check (used by cron-job.org to keep the server awake) |
| `POST /admin/create-account` | Bearer token of an admin user; creates hospital/fleet/driver auth + Firestore docs |
| `POST /rescue/match-driver` | Body `{ requestId }` — runs geohash search, sends FCM, schedules 30s radius expansion |
| `POST /rescue/match-hospital` | Body `{ requestId }` — same for hospitals |
| `POST /whatsapp/webhook` | Gupshup inbound webhook — handles text + location messages |

## Local development

```bash
cd render-backend
npm install
cp .env.example .env
# Fill in FIREBASE_SERVICE_ACCOUNT_B64, GUPSHUP_*
npm run dev
```

The server listens on `http://localhost:3000`.

Quick smoke test:
```bash
curl http://localhost:3000/healthz
```

## Deploying to Render (free tier)

1. Push the repo to GitHub.
2. Go to https://dashboard.render.com → **New +** → **Web Service**.
3. Connect your GitHub repo (`10-min` / `min-rescue`).
4. Settings:
   - **Name:** `min-rescue-backend`
   - **Region:** Singapore (closest to India)
   - **Branch:** `main`
   - **Root Directory:** `render-backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
5. **Environment Variables** (Advanced → Add Environment Variable):

   | Key | Value |
   |-----|-------|
   | `FIREBASE_SERVICE_ACCOUNT_B64` | base64 of your service account JSON |
   | `GUPSHUP_API_KEY` | from Gupshup dashboard |
   | `GUPSHUP_APP_NAME` | from Gupshup dashboard |
   | `GUPSHUP_SOURCE_NUMBER` | your Gupshup-registered phone (e.g. `917...`) |
   | `ALLOWED_ORIGINS` | `https://min-rescue.web.app,http://localhost:5173` |

6. Click **Create Web Service**.
7. Wait for build → "Live" badge.
8. Copy the public URL (e.g. `https://min-rescue-backend.onrender.com`).

### Encode the service account JSON to base64

PowerShell:
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\serviceAccount.json"))
```

macOS / Linux:
```bash
base64 -w 0 serviceAccount.json
```

Copy the single-line output — that is the value of `FIREBASE_SERVICE_ACCOUNT_B64`.

## Keep the server awake (cron-job.org)

Render free tier sleeps after 15 minutes of no requests. Cold restart takes 30–60 seconds, which is unacceptable for emergency dispatch. Solution: ping `/healthz` every 14 minutes.

1. Sign up at https://cron-job.org (free, no card).
2. **Create cronjob**:
   - **Title:** `min-rescue keepalive`
   - **URL:** `https://min-rescue-backend.onrender.com/healthz`
   - **Schedule:** Every 14 minutes
   - **Execution:** Enabled
3. Save. Verify a few successful 200 hits in the execution log.

## Wire up the React + Flutter clients

After deploy:

1. In `10min-rescue/`, set the backend URL as an env var. Create `10min-rescue/.env.local`:
   ```
   VITE_BACKEND_URL=https://min-rescue-backend.onrender.com
   ```
   (Or edit the default in `10min-rescue/src/backend.js`.)
2. Build + redeploy the web app: `npm run build && firebase deploy --only hosting`.
3. The Flutter driver app needs **no changes** — it already reads/writes Firestore directly and receives FCM pushes sent by this backend.

## Configure Gupshup webhook

1. In your Gupshup dashboard, open your WhatsApp app → **Settings** → **Webhook**.
2. Set callback URL: `https://min-rescue-backend.onrender.com/whatsapp/webhook`
3. Save and verify by sending "SOS" to your Gupshup sandbox number from WhatsApp.

## Verifying end-to-end

| Test | Expected |
|------|----------|
| Open `/healthz` in browser | `{ "ok": true, "ts": ... }` |
| Admin dashboard → Create hospital | No "internal" error; hospital appears in Firestore |
| Patient SOS from web → submit | Driver app (online + in-range) shows incoming alert within 10s |
| WhatsApp "SOS" to Gupshup number | Bot asks for location → after sharing, rescue_request appears in Firestore + driver app alerts |

## Trade-offs vs Firebase Blaze

- **No Cloud Tasks queue.** Radius expansion uses `setTimeout` in-process. If the Render server restarts mid-search, that one pending retry is lost. The driver app's own Firestore listener mitigates this.
- **Single server.** No autoscale on free tier. With <100 req/min this is fine; revisit if traffic grows.
- **Free 750 instance-hours/month.** A single always-on service uses ~744 hours. Render does not enforce strictly on free accounts in practice, but consider an upgrade if you spin up additional services.

If you ever upgrade to Firebase Blaze, you can delete this whole folder and `firebase deploy --only functions` will take over — the original Cloud Functions source in `ten_min_rescue/functions/` is untouched.
