# Suraksha Kavach — Session Handoff

> Open this first when you resume tomorrow.
> Last updated: 2026-05-22 (evening)

---

## 1. Quick status — what works RIGHT NOW

| Piece | Status | URL |
|-------|--------|-----|
| Web app (patient site, dashboards) | ✅ LIVE | https://min-rescue.web.app |
| Firestore rules + indexes | ✅ Deployed to `min-rescue` project | — |
| Render backend (replaces Cloud Functions) | ✅ LIVE | https://min-rescue-backend.onrender.com |
| Render `/healthz` health check | ✅ Returns 200 `{ok:true,...}` | https://min-rescue-backend.onrender.com/healthz |
| Render `/whatsapp/webhook` GET | ✅ Returns 200 "OK" | https://min-rescue-backend.onrender.com/whatsapp/webhook |
| Gupshup WhatsApp webhook | ✅ Saved on Gupshup (Gupshup v2 format) | Points to Render `/whatsapp/webhook` |
| GitHub repo | ✅ All code pushed | https://github.com/rohit6294/latest-10-min |

---

## 2. What's LEFT for tomorrow

### Tomorrow's TODO (in order)

1. **Set up cron-job.org keepalive** (5 min) — prevents Render free tier from sleeping (cold start = 30–60s delay, fatal for emergency app).
2. **Test WhatsApp SOS end-to-end** — send "SOS" to the Gupshup sandbox number from a phone.
3. **Test admin account creation** — log in to admin dashboard, create a test hospital (should no longer show "internal" error).
4. **Test patient SOS flow** — open `/sos` on web, submit, verify driver app gets the alert.
5. **Get the APK** from GitHub Actions and install on a real driver phone.
6. **Gupshup production setup** (optional, later) — graduate from sandbox to your own WhatsApp business number (₹500–₹2000/mo). See section 6.

---

## 3. Resume instructions — Tomorrow morning

### A. Set up cron-job.org (5 minutes)

1. Open https://cron-job.org and log in (account already created).
2. Click **Cronjobs** → **Create cronjob**.
3. Fill:
   - **Title:** `min-rescue keepalive`
   - **URL:** `https://min-rescue-backend.onrender.com/healthz`
   - **Schedule:** Every 14 minutes
4. Save and enable. Verify it shows green "200 OK" pings in the execution log within 14 min.

### B. Test the full flow

#### Test 1: Admin creates a hospital (the "internal" error bug fix)

1. Open https://min-rescue.web.app/admin
2. Log in with admin email/password (from Firebase Auth admins collection).
3. Click **Create Account** tab.
4. Pick **Hospital** → fill in name, email, password, phone, address.
5. Click **Pick on Map** → search address or click map → confirm location.
6. Click **Create**.
7. **Expected:** "Hospital account created: ... ✅" — no "internal" error.
8. Verify in Firestore: `hospitals/{uid}` doc exists with `location` GeoPoint.

#### Test 2: Patient SOS → driver alert (the missing-trigger bug fix)

Pre-req: a driver account online on a phone with the APK.

1. On phone: log in as driver → tap **Go Online** → grant location permission.
2. On laptop browser: open https://min-rescue.web.app/sos (incognito so it doesn't auth as admin).
3. Fill form → grant location → submit.
4. **Expected within ~10 sec:** driver phone shows full-screen incoming-ride alert with siren.
5. Tap **Accept** → drive through flow → complete.
6. On laptop: `/track/<requestId>` should show live ambulance position.

#### Test 3: WhatsApp SOS (Gupshup sandbox)

1. On phone WhatsApp, save `+1 555 942 9811` as a contact.
2. Send `SOS` to it.
3. **Expected reply:** "🚨 EMERGENCY RECEIVED!" + a "Share Location" button.
4. Tap Share Location → pick current location.
5. **Expected:** confirmation message with Ref ID, AND a new `rescue_requests` doc in Firestore, AND driver app gets an alert.

---

## 4. Critical URLs & credentials

| Thing | Value |
|-------|-------|
| GitHub repo | https://github.com/rohit6294/latest-10-min |
| Web app | https://min-rescue.web.app |
| Render backend | https://min-rescue-backend.onrender.com |
| Render service ID | `srv-d889d1t7vvec738j6bjg` |
| Firebase project | `min-rescue` |
| Firebase project (Spark / free plan) console | https://console.firebase.google.com/project/min-rescue |
| Gupshup app name | `10MinRescue` |
| Gupshup sandbox source number | `+15559429811` |
| Gupshup API key | `sk_dad325891dc84130b2cba60b090a2057` |
| Gupshup customer ID | `4000343295` |

### Render environment variables (already set on Render dashboard)

- `FIREBASE_SERVICE_ACCOUNT_B64` — base64 of Firebase Admin SDK service account JSON
- `ALLOWED_ORIGINS` — `https://min-rescue.web.app,http://localhost:5173`
- `GUPSHUP_API_KEY` — `sk_dad325891dc84130b2cba60b090a2057`
- `GUPSHUP_APP_NAME` — `10MinRescue`
- `GUPSHUP_SOURCE_NUMBER` — `15559429811`

⚠️ **The current Firebase service account key is the one pasted in chat earlier — it should be treated as compromised.** Once everything is verified working, generate a fresh key from Firebase Console → Project Settings → Service Accounts, base64-encode it, replace the Render env var, and revoke the old key.

---

## 5. Architecture (free-tier hybrid)

```
React web app  ──── Firestore SDK ───── Firebase Spark (FREE)
(min-rescue.web.app)                    ├─ Firestore
       │                                ├─ Firebase Auth
       │ fetch                          ├─ FCM (push)
       ▼                                └─ Hosting
Render Express (FREE 750 hrs/mo)
(min-rescue-backend.onrender.com)
       │ uses firebase-admin SDK
       │
       ├─ POST /admin/create-account   (replaces httpsCallable adminCreateAccount)
       ├─ POST /rescue/match-driver    (replaces onRescueRequestCreated trigger)
       ├─ POST /rescue/match-hospital  (replaces onHospitalAccept hospital search)
       ├─ POST /whatsapp/webhook       (Gupshup inbound — replaces whatsapp-webhook/)
       ├─ GET  /healthz                (cron-job.org pings every 14 min to prevent sleep)
       │
       └── setTimeout-based 30s radius expansion (replaces Cloud Tasks queue)

Gupshup WhatsApp ──── inbound msg ──── POST /whatsapp/webhook
       ▲
       └── outbound msg (location request, confirmations) sent by Render

cron-job.org ──── GET /healthz every 14 min ──── keeps Render awake
```

**Why this matters:** Firebase Blaze plan was rejected (user does not want to add a credit card). All compute moved off Cloud Functions to Render. Firestore + Auth + FCM stay on Firebase Spark (free, no auto-pause).

---

## 6. Gupshup production migration (optional, when ready)

Sandbox is fine for testing but the source number is shared and US-based (`+15559429811`). For real users to message your business:

1. Inside Gupshup app → **Go Live** / **Upgrade to Production**.
2. Required:
   - A phone number NOT currently on WhatsApp (regular or Business app).
   - Registered business + GSTIN.
   - Facebook Business Manager account.
3. Cost: **~₹0.30–0.85 per business-initiated message** + ~₹0.30 Meta fee per service conversation. User-initiated chats free for 24 hr after they message you. **Expect ₹500–₹2000/month** at small/medium volume. No fixed subscription.
4. Approval takes 1–10 days.
5. Once approved, update `GUPSHUP_SOURCE_NUMBER` on Render to the new number.
6. Create message **templates** in Gupshup → Templates (required for production-initiated messages): `sos_received`, `driver_dispatched`, `hospital_assigned`.

---

## 7. Get the Android APK

1. Open https://github.com/rohit6294/latest-10-min/actions
2. If Actions is disabled, click **"I understand my workflows, go ahead and enable them"**.
3. Click **Build Android APK** workflow → **Run workflow** → Run.
4. Wait ~10 min for build.
5. Click into the finished run → scroll to **Artifacts** at the bottom → download `ten_min_rescue-apk-<sha>.zip`.
6. Inside the zip:
   - `app-arm64-v8a-release.apk` (most modern phones, smaller — install this one)
   - `app-armeabi-v7a-release.apk` (older 32-bit phones)
   - `app-release.apk` (universal, larger, works everywhere)
7. Transfer to phone → tap to install → allow "Install from unknown sources" first time.

For a permanent download URL, push a `v1.0.0` git tag and the APKs get attached to a GitHub Release.

---

## 8. Known issues / gotchas

| Issue | Mitigation |
|-------|------------|
| Render free tier sleeps after 15 min idle, first request after sleep takes 30–60s | cron-job.org pings `/healthz` every 14 min (set up in step 3A above) |
| `/` route returns 404 on Render free tier (caching layer quirk, not a bug) | Doesn't matter — `/healthz` and `/whatsapp/webhook` work correctly |
| Firebase service account key was pasted in chat earlier | Treat as compromised. Rotate after verifying everything works |
| Gupshup sandbox number is US-based and shared | Sandbox is fine for testing. Migrate to production (your own number) when ready |
| Old Cloud Functions code in `ten_min_rescue/functions/` is unused but still in repo | Don't deploy it (would need Blaze). It's reference material for the Render port. Safe to delete later |
| Email domain `@10minrescue.com` not changed to `@surakshakavach.com` | Intentional — would break working email until you own the new domain's MX records |

---

## 9. Useful commands

```powershell
# Redeploy web app after changes
cd "C:\Users\rohit\Desktop\10  min\10min-rescue"
npm run build
C:\Users\rohit\AppData\Roaming\npm\firebase.cmd deploy --only hosting --project min-rescue

# Redeploy Firestore rules + indexes after changes
cd "C:\Users\rohit\Desktop\10  min\ten_min_rescue"
C:\Users\rohit\AppData\Roaming\npm\firebase.cmd deploy --only firestore:rules,firestore:indexes --project min-rescue

# Test Render backend manually
curl https://min-rescue-backend.onrender.com/healthz

# View Render logs (Live tail)
# → Render dashboard → min-rescue-backend service → Logs tab

# Trigger APK build manually
# → https://github.com/rohit6294/latest-10-min/actions
# → "Build Android APK" → "Run workflow" → Run
```

---

## 10. Recent commits (most recent first)

```
7c98d60  feat(backend): add Render Express backend to replace Cloud Functions on free tier
097817b  fix(critical): write geohash when driver goes online + add map picker for hospital address
d76b1a0  feat(admin): add account creation for hospitals, fleets, and drivers
bc8d327  fix(ci): use latest stable Flutter instead of pinned 3.24.0
e0174a9  Rebrand to Suraksha Kavach across all user-facing surfaces
22e68da  10 Min Rescue: initial commit
```

---

## 11. Open task list (for Claude when resuming)

When you start tomorrow's session, paste this prompt to Claude:

> Read `session.md` and resume from section 2 (What's LEFT for tomorrow). Start with section 3.A — guide me through setting up cron-job.org. The Render backend is already live at https://min-rescue-backend.onrender.com.

---

**End of handoff. Good night.**
