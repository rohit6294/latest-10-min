# Suraksha Kavach — Session Handoff

> Open this first when you resume.
> Last updated: 2026-05-24 (00:11 IST)

---

## 1. Quick status — what works RIGHT NOW

| Piece | Status | URL |
|-------|--------|-----|
| Web app (patient site, dashboards) | ✅ LIVE | https://min-rescue.web.app |
| Firestore rules + indexes | ✅ Deployed to `min-rescue` | — |
| Render backend (replaces Cloud Functions) | ✅ LIVE — auto-redeploys from `main` | https://min-rescue-backend.onrender.com |
| `/healthz` | ✅ 200 | https://min-rescue-backend.onrender.com/healthz |
| `/whatsapp/webhook` (Gupshup v2) | ✅ 200 | https://min-rescue-backend.onrender.com/whatsapp/webhook |
| `/rescue/rate` (NEW) | ✅ deployed, returns 400 on empty body | — |
| `/rescue/instruction` (NEW) | ✅ deployed, returns 400 on empty body | — |
| GitHub repo (main) | ✅ pushed | https://github.com/rohit6294/latest-10-min |
| Latest APK | ✅ built | `ten_min_rescue/build/app/outputs/flutter-apk/app-release-20260524-0011.apk` (53 MB) |

---

## 2. Where we are in the product roadmap

Suraksha Kavach is an emergency ambulance dispatch platform: patient → SOS via web/WhatsApp → nearest driver → hospital → live tracking the whole way. Three apps + one backend on Firebase Spark (free) plan.

Recent sprints have been pushing it past "table-stakes parity with 108 / RED.Health / Dial4242" and toward features investors and real patients actually need:

- **Reach the driver fast** — direct call button on track page + in WhatsApp.
- **Safety net when matching fails** — 108 fallback banner after 60s.
- **Driver accountability** — gamification (rating + completed rides + points), pre-shift kit checklist.
- **Hospital pre-arrival prep** — ER sees driver contact + patient instructions before the ambulance arrives.
- **Patient agency en route** — text + voice instructions added on the live track page.
- **Ops analytics** — every driver decline carries a reason chip ("too_far", "wrong_type", …).

---

## 3. What changed in the last 2 sessions (2026-05-22 → 2026-05-24)

### Session A — 2026-05-22 (TrackPage driver call + WhatsApp polish + SOS layout + bed buffer)

Commit `eb4a8fb` — _feat: surface driver phone, tighten SOS wizard, buffer hospital beds for drivers_

- Web `/track/:id` shows a prominent green "Call Driver" button right above the helpline whenever a driver is assigned.
- WhatsApp `driver_assigned` / `ambulance_arrived` messages now include a tappable "📞 Call driver: <phone>" line.
- SOS wizard: replaced `mt-auto pt-6` with `mt-6 pb-4` on all step button bars so Back/Continue sit immediately under the form on small phones.
- Driver hospital list: explicit "FACILITIES" section per hospital with a "No facilities listed" fallback when empty.
- Driver app shows hospital bed counts at **30% less** than the hospital-reported number. **This is a deliberate product decision — see `MEMORY.md` → `project_driver_bed_buffer.md`.** Patient SOS / hospital dashboard / admin still see raw counts.

Files touched: `10min-rescue/src/pages/{TrackPage,SosPage}.jsx`, `render-backend/routes/whatsapp.js`, `ten_min_rescue/lib/core/models/hospital_model.dart`, `ten_min_rescue/lib/features/driver/screens/{select_hospital_screen,navigate_to_hospital_screen}.dart`.

### Session B — 2026-05-23/24 (in-flight features)

Commit `2d61b51` — _feat: 108 fallback, driver rating + gamification, patient instructions, refusal reasons, pre-shift checklist, hospital handoff_

#### 108 fallback
- `TrackPage.jsx` ticks once a second and computes `elapsedMs` from `req.createdAt`. If status is still `pending_driver` after **60 seconds**, a red banner renders above the map with a "📞 CALL 108 NOW" CTA. We keep dispatching our drivers in parallel — the banner just gives the caller a safety net.

#### Driver rating + gamification
- `DriverModel` gained `rating`, `totalRatings`, `completedRides`, plus a derived `points` getter (`completedRides * 10 + (rating * 20).round()`).
- Driver home now shows a top-row stat strip: **Rating / Rides / Points**, with Vehicle / Status on the row below.
- New backend route **`POST /rescue/rate`** body `{ requestId, rating: 1-5, comment? }`:
  - Idempotent on `rescue_requests.patientRating` — re-submits return 409.
  - Requires `status: 'completed'`.
  - Inside a Firestore transaction it: writes `patientRating` to the request, then recomputes the driver's running mean and bumps `completedRides`.
- On TrackPage, when the request is completed and not yet rated, a star modal (`RatingPanel`) appears. After submit, replaced with a "🙏 thanks for your feedback" card.

#### Patient instructions (text + voice)
- New subcollection: `rescue_requests/{id}/instructions/{id}` ordered by `createdAt`.
  - Text payload: `{ type: 'text', text }` (≤500 chars).
  - Audio payload: `{ type: 'audio', mimeType, durationSec, audioUrl }` — or `audioBase64` if Storage upload failed.
- New backend route **`POST /rescue/instruction`**:
  - Body `{ requestId, type: 'text'|'audio', text?, audioBase64?, mimeType?, durationSec? }`.
  - For audio: decodes base64, uploads to Firebase Storage at `instructions/{requestId}/{id}.<ext>`, calls `makePublic()`, returns the public URL. Falls back to inline base64 in Firestore if Storage isn't enabled (~700 KB cap).
  - Sends an FCM data push to the assigned driver (`type: patient_instruction`) when a new note arrives.
  - Rejects writes on closed (`completed`/`cancelled`) requests.
- On TrackPage, `InstructionsPanel`:
  - Short text input + "Send text" button.
  - "🎤 Record voice" button uses `MediaRecorder` (`audio/webm;codecs=opus`, 24 kbps), 30s auto-stop, base64-uploads to the backend.
  - Lists all sent instructions (with HTML5 `<audio>` element when an audioUrl/base64 is present).
- Driver app (`navigate_to_patient_screen.dart`) — new `_InstructionsStripe` widget streams the subcollection into the bottom sheet between the patient row and the ETA chips. Voice notes "Play" via `url_launcher` → system browser/media player.

#### Hospital pre-arrival handoff
- `incoming_ambulance_screen.dart` now scrolls (wraps the patient card in `Flexible + SingleChildScrollView`) and adds:
  - **`_DriverHandoffCard`** — name, vehicle, tap-to-call icon, streams from `drivers/{assignedDriverId}`.
  - **`_HospitalInstructionsCard`** — same `watchInstructions()` stream the driver sees, so ER prep gets the patient's "diabetic / stroke onset 7:42" notes before the ambulance arrives.

#### Refusal reason capture
- `FirestoreService.ignorePendingRequest(requestId, driverId, {reason})` now takes a reason code. Persists:
  - `rescue_requests.declinedDriverIds` (existing) + a structured `declineLog[]` entry per decline.
  - On the driver doc: `lastDeclineReason`, `lastDeclineAt`, and `declineCounts.<reason>` increment (uses `update()` for proper nesting; falls back to `set(merge:true)` if doc has no map yet).
- `incoming_request_screen.dart`:
  - "Decline" tap now opens a bottom sheet of 1-tap reason chips: **Too far · Wrong ambulance type · On break · Vehicle issue · Patient unreachable · Other**.
  - Timer cancels while the sheet is open and resumes if the driver backs out.
  - System back-button dismissal logs reason `back_dismissed`; timer expiry logs `timeout`.

#### Pre-shift equipment checklist
- New screen `equipment_checklist_screen.dart` — 6-item kit verification (oxygen, defib, suction, stretcher belts, first-aid kit, fuel & vehicle). Driver must check all 6 before "Go Online" enables.
- `DriverModel` gained `lastEquipmentCheckAt` + `hasFreshEquipmentCheck` (12 h freshness window).
- `driver_home_screen._toggleOnline(isOnline, driver)` now intercepts the off→on transition: if `!driver.hasFreshEquipmentCheck`, push the checklist screen as a `fullscreenDialog`. If the driver bails, they stay offline. If they complete, `FirestoreService.recordEquipmentCheck()` stamps the timestamp and the driver flips online.

Files touched in commit `2d61b51`:
- `10min-rescue/src/pages/TrackPage.jsx`
- `render-backend/routes/rescue.js`
- `ten_min_rescue/lib/core/models/driver_model.dart`
- `ten_min_rescue/lib/core/services/firestore_service.dart`
- `ten_min_rescue/lib/features/driver/screens/driver_home_screen.dart`
- `ten_min_rescue/lib/features/driver/screens/incoming_request_screen.dart`
- `ten_min_rescue/lib/features/driver/screens/navigate_to_patient_screen.dart`
- `ten_min_rescue/lib/features/hospital/screens/incoming_ambulance_screen.dart`
- _new_ `ten_min_rescue/lib/features/driver/screens/equipment_checklist_screen.dart`

(One post-commit follow-up: the `declineCounts.$reason` write now uses `update()` semantics — not yet committed. Stage when picking up next session.)

---

## 4. Architecture pointers (so the next Claude doesn't re-derive them)

- **Three sub-apps, one Firestore:**
  - `10min-rescue/` — React 19 + Vite + Tailwind. Patient SOS + admin + hospital + fleet web dashboards + tracking page. Hosted on Firebase Hosting at https://min-rescue.web.app.
  - `ten_min_rescue/` — Flutter (Riverpod + GoRouter). Drivers + hospitals.
  - `whatsapp-webhook/` — older Vercel handler (still present, but **not the live path**). The active WhatsApp webhook is `render-backend/routes/whatsapp.js`.
- **`render-backend/`** — Express on Render, uses `firebase-admin`. Routes:
  - `/healthz`, `/admin/*`, `/rescue/*` (match-driver, match-hospital, **rate**, **instruction**), `/whatsapp/{webhook,request-event}`.
  - Auto-deploys on `git push origin main` (free tier, ~1–3 min). To force a redeploy, push an empty commit `git commit --allow-empty -m "chore: trigger redeploy"`.
- **Geo matching** — geohash + radius expansion 1 → 2 → 5 → 10 km, scheduled by `lib/matching.js` using setTimeout (Render keeps the worker warm; cron-job.org pings prevent sleep).
- **WhatsApp:** Gupshup v2 inbound → `routes/whatsapp.js`. Driver/hospital state changes call the same backend `/whatsapp/request-event` to push status messages back to the patient's WhatsApp.
- **Rescue request lifecycle:** `pending_driver → driver_assigned → patient_picked_up → (awaiting_hospital_choice | hospital_assigned) → in_transit → completed` (or `cancelled`). Codified in `RescueRequestModel`.
- **Hospital bed buffer (30%):** see [Memory → project_driver_bed_buffer.md](.claude/projects/.../memory/project_driver_bed_buffer.md). Driver app uses `HospitalModel.availableBedsForDriver(type)` / `*AvailableForDriver` getters; raw fields stay for hospital/patient/admin UIs.

---

## 5. Operational notes

- **Service account** lives at `min-rescue-firebase-adminsdk-fbsvc-32a002c3db.json` (root) and `render-backend/` (same file copy). Render reads it via `FIREBASE_SERVICE_ACCOUNT_B64` env var.
- **Firebase Storage:** as of this writing, may not be initialized. The `/rescue/instruction` route silently falls back to inline-base64 if Storage isn't ready. To enable it cleanly:
  1. Open https://console.firebase.google.com/project/min-rescue/storage → "Get started" → default rules.
  2. Replace rules with the policy listed in `BUGS.md` item #2.
- **Free-tier ceilings to watch:**
  - Render free worker sleeps after ~15 min idle → cron-job.org keepalive ping every 14 min.
  - Firestore Spark = 50K reads / 20K writes / 1 GB stored / day. Each instruction adds one read per subscriber, so a busy ride with 5 followers + 10 instructions = 50 reads. Fine for now.
  - Firebase Storage Spark = 5 GB stored, 1 GB downloaded/day. ~80 KB per voice note → ~12 K voice notes/day cap. Fine.

---

## 6. Open todo list (from the task tracker)

| # | Status | Item |
|---|--------|------|
| 9  | ✅ done | 108 fallback banner on TrackPage |
| 10 | ✅ done | Driver rating + gamification |
| 11 | ✅ done | Patient instructions subcollection (text + voice) |
| 12 | ✅ done | Driver screen — display instructions |
| 13 | ✅ done | Hospital pre-arrival handoff enrichment |
| 14 | ✅ done | Commit, deploy, build APK |
| 15 | ✅ done | Refusal reason capture |
| 16 | ✅ done | Pre-shift equipment checklist |
| 17 | ✅ done | Test full flow + log bugs (see BUGS.md) |
| 18 | 🟡 in-progress | Update session.md (this file) |

### Next obvious things to pick up

1. Apply BUGS.md items 1, 2, 3 (Storage enablement + completedRides counted on `completeRide()`).
2. Manual QA on a real device: patient SOS → driver accept on the new APK → text + voice instruction → hospital handoff card → rating after completion. Tick boxes at the bottom of BUGS.md.
3. From competitor-analysis tier 1: medical ID profile + family SOS + crash auto-SOS are the highest-impact features still unbuilt.
4. Commit the `declineCounts` Firestore write fix.

---

## 7. Glossary

- **ICU / Advanced / Normal** = ambulance type A / B / C. `AmbulanceType` enum maps it both ways.
- **Pending driver radius** = the geohash radius the matcher is currently scanning. Expands per the schedule above.
- **Equipment freshness** = the 12 h window in which a driver doesn't need to re-do the pre-shift kit check (`DriverModel.equipmentCheckFreshness`).
- **Refusal reason codes** = `too_far`, `wrong_type`, `on_break`, `vehicle_issue`, `patient_unreachable`, `other`, plus the system-issued `timeout` and `back_dismissed`.
- **Public app URL** = `https://min-rescue.web.app` (set as `PUBLIC_APP_URL` in render-backend env so WhatsApp messages link back here).
