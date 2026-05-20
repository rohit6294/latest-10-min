# Suraksha Kavach — Work Session Log

> Living handoff document. Open this first when resuming work in any session.
> Last updated: 2026-05-20

---

## 1. Project map

| Folder | Stack | Purpose |
|--------|-------|---------|
| `10min-rescue/` | React 19 + Vite + Tailwind, Firebase | Web: landing, SOS wizard, live tracking, hospital + admin + fleet dashboards |
| `ten_min_rescue/` | Flutter (GoRouter), Firebase | Mobile app for ambulance drivers and hospitals |
| `ten_min_rescue/functions/` | TypeScript Cloud Functions (Node 20) | Driver matching, FCM push, radius expansion, fleet join codes |
| `whatsapp-webhook/` | Node.js (Vercel) | WhatsApp emergency intake gateway |

Firebase project: **min-rescue** · Functions region: **asia-south1**

Request lifecycle (collection `rescue_requests`):
`pending_driver → driver_assigned → patient_picked_up / awaiting_hospital_choice → hospital_assigned → in_transit → completed` (or `cancelled`)

---

## 2. What this work block delivered

1. Fix driver push notifications (broken end-to-end). ✅
2. Loud, call-style emergency alert on the driver phone. ✅
3. Web SOS unified into `rescue_requests`. ✅
4. Driver trip flow polish + live bed availability. ✅
5. Hospital dashboard alert polish — full-screen incoming overlay, looping chime, system-notification, ack-writes-to-server. ✅
6. Ambulance Admin (NGO fleet) web dashboard + driver↔NGO linking. ✅
7. iOS scaffold via Codemagic + APNs/FCM wiring. ✅

---

## 3. Progress

### DONE

**Notifications — Cloud Functions** (`ten_min_rescue/functions/src/`)
- `fcm.ts` — `sendAlert` (data-only high-priority push) + `sendSilentData` helpers.
- `onRescueRequestCreated.ts` — onCreate trigger; starts driver search the moment a request is created.
- `findNearbyDrivers.ts` — sends data-only pushes with title/body.
- `onDriverAccept.ts` — cancels the alert on other drivers + copies driver display info onto the request.
- `onHospitalAccept.ts` — pushes an alert to the chosen hospital + copies hospital info onto the request.
- `onRequestCompleted.ts` — frees a hospital bed server-side when a trip completes.
- `joinFleetByCode.ts` *(new)* — callable; validates a fleet's 6-char code and links a driver's `fleetId` server-side (drivers cannot set arbitrary fleetIds via rules).
- `index.ts` — exports the new functions.

**Notifications — Flutter** (`ten_min_rescue/`)
- `pubspec.yaml` — added `flutter_local_notifications`.
- `android/app/build.gradle.kts` — enabled core library desugaring.
- `lib/core/services/notification_service.dart` — emergency channel, full-screen call-style alert, tap routing.
- `lib/core/services/fcm_service.dart` — background handler + foreground listener + token registration.
- `lib/main.dart` / `lib/app.dart` — wires handlers; routes the app when launched from a notification.

**Web SOS unified into `rescue_requests`** (`10min-rescue/`)
- `src/pages/SosPage.jsx` — writes `rescue_requests` (was `sos_requests`); collects patient name + phone.
- `src/pages/TrackPage.jsx` — reads `rescue_requests`; shows driver + hospital + live map.
- `src/App.jsx` — `/track/:requestId` route.

**Hospital dashboard alert polish** *(new)*
- `src/components/hospital/IncomingAlertOverlay.jsx` *(new)* — full-screen modal that pops up the moment a new request is assigned to this hospital: pulsing red banner, looping 3-tone chime via WebAudio (no asset file), `Notification` API system push (works when the tab is unfocused), patient/driver/bed-type info, Google Maps link, "Acknowledge & Prepare" button that writes `hospitalAckAt` + `hospitalAckBy` to Firestore.
- `src/pages/HospitalDashboard.jsx` — requests Notification permission on first user interaction; finds the first unacknowledged `hospital_assigned` request and renders the overlay over the whole page until acknowledged.
- `src/index.css` — added `.animate-fade-in` utility for the overlay backdrop.
- `ten_min_rescue/firestore.rules` — hospital's `update` allowlist extended with `hospitalAckAt` / `hospitalAckBy`.

**Fleet / NGO admin dashboard** *(new)*
- Collection `ambulance_fleets/{fleetUid}` — `{ name, contactPerson, phone, email, address, joinCode, joinCodeUpdatedAt, isActive, ownerUid, createdAt }`. Created by the Suraksha Kavach admin team (no public signup).
- Driver doc `fleetId` (+ denormalised `fleetName`, `fleetLinkedAt`) — already in `DriverModel`; index already in `firestore.indexes.json`.
- `src/pages/FleetLogin.jsx` *(new)* — `/fleet` email+password sign-in; verifies an `ambulance_fleets/{uid}` doc exists.
- `src/pages/FleetDashboard.jsx` *(new)* — `/fleet/dashboard`. Live driver list (online/offline/verified badges), live trips for those drivers (10-IN-chunk-merging Firestore listener), 5-card stats (drivers / online / verified / active trips / done today), 3 tabs (Drivers, Live Trips, Settings). Link a driver by phone (fleet rules let the fleet rewrite `fleetId`/`fleetName`/`fleetLinkedAt` only when the driver is unaffiliated or theirs). Settings tab generates / rotates a 6-char join code (alphabet excludes 0/O, 1/I).
- `src/App.jsx` + `src/components/Navbar.jsx` — wired the `/fleet` route and discoverable nav link (desktop + mobile menu).
- `ten_min_rescue/firestore.rules` — added `isFleetAdmin()` helper, `ambulance_fleets/{uid}` rules (read/update own profile + rotate join code), broadened `drivers` reads + narrow `update` to `[fleetId, fleetName, fleetLinkedAt]` only, and added fleets to `rescue_requests` listers.

**iOS + Codemagic** *(new)*
- `ten_min_rescue/codemagic.yaml` *(new)* — full `ios-driver-app` workflow: scaffolds `ios/` with `flutter create --platforms=ios .` on demand, overlays our `Info.plist` + `AppDelegate.swift`, appends our `Podfile` patch, decodes the secure `GOOGLE_SERVICE_INFO_PLIST` env, fetches signing files via App Store Connect API, builds release IPA with auto-incremented build number, publishes to TestFlight beta group.
- `ten_min_rescue/ios_overrides/Info.plist` *(new)* — locations (when-in-use + always), microphone, photos, camera, `LSApplicationQueriesSchemes` for tel/maps, background modes `[fetch, location, remote-notification, audio]`, `aps-environment=production`, scoped ATS exception for localhost emulator.
- `ten_min_rescue/ios_overrides/AppDelegate.swift` *(new)* — `FirebaseApp.configure()`, `Messaging.delegate`, `UNUserNotificationCenter.delegate`, requests `[.alert, .sound, .badge, .criticalAlert]` auth, bridges APNs → FCM token.
- `ten_min_rescue/ios_overrides/Podfile.append` *(new)* — bumps `IPHONEOS_DEPLOYMENT_TARGET` to 13 (required by firebase_messaging), wires `permission_handler` compile flags.
- `ten_min_rescue/IOS_SETUP.md` *(new)* — step-by-step Apple Developer + APNs + App Store Connect + Codemagic env-var checklist; explains the "ios/ is regenerated each build" pattern; troubleshooting.

### PENDING

Nothing on the original list — all seven items complete. Possible follow-ups:
- Verify on a real device / live Firebase deploy (requires Apple Developer account + Codemagic account for iOS).
- Mobile "Join Fleet" screen in the driver app — wire to the `joinFleetByCode` callable. Backend is ready; the UI is a small form.
- Driver↔fleet stats charts (response time, trips/day) on the Fleet dashboard once enough trip data accrues.

---

## 4. Key architectural decisions

- **One request collection.** `sos_requests` is retired; everything flows through `rescue_requests` so the web, app, Cloud Functions and tracking page share one source of truth.
- **Hospital is chosen manually by the driver** after pickup — the old auto hospital-matching in `onDriverAccept` was removed (it broke the driver's trip flow).
- **Data-only FCM** — pushes carry no `notification` block, so the Flutter app always builds its own loud, full-screen alert. `apns` config keeps iOS delivery working.
- **Tracking page is secure-by-design** — it reads only the `rescue_requests` doc + `location_updates`; Cloud Functions copy driver/hospital display info onto the request so no PII collection is exposed publicly.
- **Hospital "ack" is server-recorded.** The overlay can only be dismissed by writing `hospitalAckAt` to Firestore — gives ops a real audit trail and lets future Cloud Functions escalate if no one acks within N seconds.
- **Fleet driver linking is a callable, not a rules-allowed write.** Drivers cannot set `fleetId` on their own doc; the only way to link is `joinFleetByCode` (validates the 6-char code on the server) or a fleet admin doing it from the dashboard. This stops a malicious driver from impersonating fleet membership.
- **iOS folder is not committed.** Codemagic generates it on every build and overlays our `ios_overrides/` files. Keeps the repo small and avoids Xcode project merge conflicts.

---

## 5. Deploy & test

```bash
# Cloud Functions
cd "ten_min_rescue/functions" && npm install && npm run build
firebase deploy --only functions
# One-time: create the Cloud Tasks queue used for radius expansion
gcloud tasks queues create timeout-queue --location=asia-south1

# Firestore rules + indexes (now also covers ambulance_fleets)
cd "ten_min_rescue" && firebase deploy --only firestore:rules,firestore:indexes

# Flutter driver/hospital app
cd "ten_min_rescue" && flutter pub get && flutter run

# Web app (now also serves /fleet and /fleet/dashboard)
cd "10min-rescue" && npm install && npm run build && firebase deploy --only hosting
```

**Onboard a new fleet (one-time, admin team):**
1. Create a Firebase Auth user (email + password) for the fleet contact.
2. In Firestore, create `ambulance_fleets/{newAuthUid}` with `{ name, contactPerson, phone, email, address, isActive: true, createdAt: serverTimestamp() }`.
3. The fleet signs in at `/fleet`, opens **Settings → Generate Join Code**, shares the 6-char code with their drivers. Drivers paste it into the mobile app's "Join Fleet" screen (calls `joinFleetByCode`).

**End-to-end test of hospital alert:** open `/sos` on the web with the driver app closed on a phone → submit → driver gets full-screen alert → accept → drive to pickup → tap "Select Hospital" and pick one → that hospital's `/hospital/dashboard` (open in another browser) should immediately raise the full-screen `IncomingAlertOverlay` with a looping siren chime and a system notification (if the tab is unfocused). Pressing "Acknowledge & Prepare" writes `hospitalAckAt` and dismisses the overlay; the request stays in the **Incoming** tab until the trip progresses to `in_transit`.

**Prerequisites still needed:**
- Cloud Tasks `timeout-queue` in `asia-south1`.
- For iOS: Apple Developer account (~$99/yr) + APNs key uploaded to Firebase + Codemagic account configured per `ten_min_rescue/IOS_SETUP.md`.

---

## 6. Verification status

- Cloud Functions: `npx tsc --noEmit` passes (including new `joinFleetByCode`).
- Web app: `npm run build` passes (818 KB main bundle, expected for this many Firebase modules + Leaflet).
- Flutter: `flutter analyze` shows 21 pre-existing infos/warnings (none introduced this session — my changes were Cloud Functions + React only).
- Firestore rules: syntactically reviewed; not yet deployed against the emulator. Recommended next step: `firebase emulators:exec --only firestore "..."` with a small rules-unit-test suite.
- Not yet verified on a real device / live Firebase (requires deploy).
