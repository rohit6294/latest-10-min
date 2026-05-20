# iOS Setup — Suraksha Kavach Driver App

The repository does not commit the generated `ios/` folder. Instead, the iOS
build is regenerated on every Codemagic CI run by `flutter create
--platforms=ios`, then patched with the files in `ios_overrides/`. This keeps
the repository small and avoids Xcode-merge-conflict pain while still giving
you a fully reproducible iOS build.

If you want a local iOS build on a Mac, run:

```bash
cd ten_min_rescue
flutter create --platforms=ios --org com.tenminrescue --project-name ten_min_rescue .
cp ios_overrides/Info.plist          ios/Runner/Info.plist
cp ios_overrides/AppDelegate.swift   ios/Runner/AppDelegate.swift
cat ios_overrides/Podfile.append  >> ios/Podfile     # only run once
cd ios && pod install
```

Then open `ios/Runner.xcworkspace` in Xcode.

---

## One-time setup outside the repo

| Step | Where | Notes |
|------|-------|-------|
| 1. Apple Developer Program | developer.apple.com | $99/yr. Must be enrolled before any TestFlight build. |
| 2. App Store Connect app record | appstoreconnect.apple.com | Bundle ID `com.tenminrescue.driver` (or your chosen ID — keep in sync with `codemagic.yaml`'s `BUNDLE_ID`). |
| 3. APNs key (`.p8`) | developer.apple.com → Certificates → Keys | Download once. Save the Key ID and Team ID. |
| 4. Upload APNs key to Firebase | console.firebase.google.com → Project Settings → Cloud Messaging → Apple app config | Required for FCM to reach iOS devices. |
| 5. App Store Connect API key | App Store Connect → Users & Access → Keys | Save the `.p8`, Key ID, Issuer ID. Used by Codemagic to publish to TestFlight. |
| 6. Codemagic account | codemagic.io | Free tier covers ~500 build-minutes/mo, enough for early TestFlight builds. |

---

## Codemagic environment variables

Create one Environment Group called **`ios_signing`** (referenced from
`codemagic.yaml`) and add:

| Variable | Type | Value |
|----------|------|-------|
| `APP_STORE_CONNECT_PRIVATE_KEY` | secure | Contents of the `.p8` API key (PEM lines included). |
| `APP_STORE_CONNECT_KEY_IDENTIFIER` | plain | Key ID from step 5. |
| `APP_STORE_CONNECT_ISSUER_ID` | plain | Issuer ID from step 5. |
| `CERTIFICATE_PRIVATE_KEY` | secure | PEM-encoded distribution certificate private key (Codemagic can generate this for you with `codemagic-cli-tools`). |
| `BUNDLE_ID` | plain | e.g. `com.tenminrescue.driver`. |
| `GOOGLE_SERVICE_INFO_PLIST` | secure file | The `GoogleService-Info.plist` downloaded from Firebase Console, base64-encoded (`base64 -i GoogleService-Info.plist`). |

Then attach the **App Store Connect integration** in Codemagic
(Teams → Integrations → App Store Connect) using the same API key. The
`publishing.app_store_connect.auth: integration` line in `codemagic.yaml`
picks it up automatically.

---

## What the CI does each run

1. `flutter create --platforms=ios .` if `ios/` is missing.
2. Overlay our `Info.plist` (locations, microphone, background modes, APNs
   env) and `AppDelegate.swift` (Firebase + UNUserNotificationCenter wiring)
   from `ios_overrides/`.
3. Append `ios_overrides/Podfile.append` to bump `IPHONEOS_DEPLOYMENT_TARGET`
   to 13 (required by `firebase_messaging`) and set
   `permission_handler` compile flags.
4. Decode `GOOGLE_SERVICE_INFO_PLIST` into `ios/Runner/`.
5. Fetch signing files from App Store Connect, install the certificate, and
   provision the build.
6. `flutter build ipa --release` with an auto-incremented build number.
7. Upload to TestFlight, beta-group "Suraksha Kavach Internal".

---

## Troubleshooting

- **"No matching provisioning profile"** — make sure the bundle ID in
  Codemagic matches the App Store Connect app record. Re-run
  `app-store-connect fetch-signing-files` from the Codemagic console.
- **FCM token never arrives on iOS** — APNs key probably isn't uploaded to
  Firebase, or `aps-environment` in `Info.plist` is set to `production` on a
  development build (or vice-versa).
- **Build fails on Podfile** — delete `ios/Podfile.lock` in the Codemagic
  scripts step and rerun `pod install`.
- **App crashes on launch with "duplicate-app"** — `FirebaseApp.configure()`
  ran twice. Make sure no other AppDelegate override calls
  `FirebaseApp.configure()` in addition to ours.
