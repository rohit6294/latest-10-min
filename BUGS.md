# Known issues, limitations and follow-up bugs

_Last audited: 2026-05-24_

Each item is grouped by impact. Numbered so the next session can pick one up and reference it directly.

## 🔴 Must-fix before a real demo

1. **Firebase Storage may not be enabled on the project.** The `/rescue/instruction` backend route uses `admin.storage().bucket()` to upload voice notes. If Storage hasn't been turned on in the Firebase Console (Spark plan still requires the user to click "Get started" once), uploads fall back to inline base64 in Firestore. Verify by recording a voice note from the patient track page: if Firestore subcollection contains `audioUrl` → Storage is live; if it contains `audioBase64` → enable Storage at https://console.firebase.google.com/project/min-rescue/storage.
2. **Storage rules need a public-read policy for voice notes.** Even with Storage enabled, downloads from the Flutter driver/hospital app go via `url_launcher` to a public HTTPS URL. The backend calls `file.makePublic()` after upload, but if Storage default rules block public reads, this will silently fail and `audioUrl` will not be reachable. Recommended `storage.rules`:
   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /instructions/{requestId}/{file} {
         allow read: if true;
         allow write: if false; // only Admin SDK
       }
     }
   }
   ```
3. **Driver completedRides counter is single-incremented inside `/rescue/rate` only when a rating is submitted.** If the patient never rates (which is the common case), `completedRides` stays at zero on the driver doc — so the home stats and gamification points understate real work. Move ride counting into `completeRide()` on the Flutter side (or have the backend onCompletion trigger handle it).

## 🟡 Functional gaps — works, but not great

4. **Voice notes don't play in-app on Flutter.** Driver/hospital apps tap "Play" → URL is opened in the system browser/media player via `url_launcher`. On Android this works but pulls the user out of the app; iOS may show an "Open in" prompt. Add `audioplayers: ^6.0.0` + path_provider for an inline mini player in v2.
5. **Equipment checklist 12h freshness is client-clock-based.** A driver who manipulates device time could skip the check. For real ops, validate `lastEquipmentCheckAt` on the backend before allowing request acceptance.
6. **Rating modal is only shown to the patient who has the track URL open at completion.** WhatsApp-source patients never visit the web track page → never get prompted to rate. Add a "Rate your driver" link to the existing `mission_completed` WhatsApp message that deep-links into `/track/{id}?rate=1`.
7. **Patient can submit only one instruction at a time; no edit/delete.** Acceptable for v1 but a frustrated patient may want to correct a typo. Add a "Delete" affordance on each instruction row (only their own, within 60s of sending).
8. **108 fallback banner uses local clock for elapsed time.** Time-zone shifts mid-ride could under/over-trigger by an hour. Compare server timestamp instead (use Firestore server time + `lastUpdated`).
9. **Refusal reason chips don't have a free-text "Other → describe" path.** The "Other" chip persists as just `"other"` with no follow-up — losing useful signal. Add a small text field after picking Other.

## 🟢 Cosmetic / polish

10. **Web TrackPage hits a 866KB JS bundle.** Vite warns on the build; consider dynamic-importing Leaflet so the initial paint is faster on 3G.
11. **Equipment checklist is a single shared list for all ambulance types.** Type A (ICU) drivers should also confirm ventilator, IV pumps. Add per-type items in a follow-up.
12. **Driver home stat row now wraps to two rows.** On very narrow screens (<360 px) the 3-stat row gets cramped. Acceptable on modern phones; verify on a low-end Redmi.
13. **No mic permission UX on the patient track page.** Browser auto-prompts on first record click; if the user denies, the error toast appears but there's no "fix permissions" guide.
14. **Instructions panel doesn't show timestamps.** Each note should say "2 min ago".
15. **Inline base64 fallback for voice notes inflates Firestore docs** to ~80KB each. Firestore charges per-read and we'll bleed cost if a request has many voice notes. Move to Storage as soon as it's enabled.

## 🛠 Pre-existing lints (not regressions, but worth noting)

- 24 lints reported by `flutter analyze`, mostly `unnecessary_underscores` and a few `use_build_context_synchronously` warnings. All pre-existed this session. Worth a sweep with `dart fix --apply`.

## Verified to work this session (smoke-tested live)

- Backend `/healthz` → 200
- Backend `/rescue/rate` → 400 on empty body (new route reachable)
- Backend `/rescue/instruction` → 400 on empty body (new route reachable)
- Web app at https://min-rescue.web.app → 200, latest build deployed
- Flutter `flutter analyze` → no compile errors
- Flutter `flutter build apk --release` → succeeds (53.3 MB)
- Timestamped APK saved at `ten_min_rescue/build/app/outputs/flutter-apk/app-release-20260524-0011.apk`

## Untested in this session (manual QA recommended)

- [ ] Patient SOS → driver accept → instructions arrive in driver app → hospital handoff card populates (end-to-end on real devices)
- [ ] Voice recording on Chrome Android (MediaRecorder + Opus support)
- [ ] Voice playback URL on a Flutter driver phone (Storage public-read)
- [ ] Driver going Online for the first time gets the equipment checklist
- [ ] Driver going Online again within 12 hours skips the checklist
- [ ] Refusal chip dialog opens, picks a reason, decline succeeds, returns home
- [ ] Patient rates a completed ride → driver doc rating updates in real time
- [ ] 108 fallback banner appears after 60 s of pending_driver
