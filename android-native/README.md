# MUN PRO — Android (Kotlin)

The Android app for MUN PRO, and the only mobile app (the earlier React Native app was retired on
2026-10-28): Kotlin + Jetpack Compose, Firebase (Auth, Firestore, Realtime
Database) and Agora for live video. It talks to the same Firebase project and the same Firestore
rules as the website, so a delegate can use the app, the site, or both.

This repository is the `android-native/` folder of the main MUN Platform repo, split out with its
history. The main repo is the source of truth; changes land there first and are pushed here.

## Setup

1. Android Studio (it supplies the JDK at `C:\Program Files\Android\Android Studio\jbr`) and the
   Android SDK (`%LOCALAPPDATA%\Android\Sdk`).
2. Create `local.properties` in this folder (it is git-ignored). Firebase is started from the web
   app's config, so no `google-services.json` is needed:

   ```properties
   sdk.dir=C\:\\Users\\<you>\\AppData\\Local\\Android\\Sdk
   FIREBASE_API_KEY=...
   FIREBASE_APP_ID=...
   FIREBASE_PROJECT_ID=...
   FIREBASE_MESSAGING_SENDER_ID=...
   FIREBASE_STORAGE_BUCKET=...
   FIREBASE_DATABASE_URL=...
   # The website the app calls for server routes (video tokens, AI assist, notifications).
   API_URL=https://munpilot.com
   # Google sign-in: the WEB OAuth client id (Firebase console -> Authentication -> Sign-in
   # method -> Google -> Web SDK configuration). Leave it out and every Google button hides.
   GOOGLE_WEB_CLIENT_ID=...apps.googleusercontent.com
   # In-app updates: the public URL of the R2 bucket releases go to (see "Releasing").
   # Leave it out and the app checks API_URL's /api/app/latest instead.
   UPDATE_BASE_URL=https://dl.munpilot.com
   # Releasing only: the Cloudflare account that owns the R2 bucket and munpilot.com. SECRET.
   CLOUDFLARE_ACCOUNT_ID=...
   CLOUDFLARE_API_TOKEN=...
   ```

   Google sign-in also needs the signing key's SHA-1 on an Android app in the same Firebase
   project (Project settings -> Your apps -> Add app -> Android, package `com.munpro.app.kt`,
   then "Add fingerprint"). Builds are signed with the debug key until release, so:
   `keytool -list -v -keystore %USERPROFILE%\.android\debug.keystore -alias androiddebugkey -storepass android`.
   Without the fingerprint the Google sheet opens and then fails with "Google sign-in didn't finish".

   The app runs against **https://munpilot.com** and its Firebase project **mun-platform-saas**;
   use that project's web config above. For the local dev server use
   `API_URL=http://10.0.2.2:3100` (the host machine as seen from the emulator; debug builds allow
   cleartext to it only). These values are baked in at build time: change one, rebuild.

## Build

```bash
./gradlew testDebugUnitTest assembleDebug      # unit tests + debug APK
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

On Windows inside the main repo, `build.cmd [tasks]` builds from a short `M:` drive, because the
native libraries hit the 260-character path limit under long paths.

Both build types install as `com.munpro.app.kt` for now (switch to `com.munpro.app` with real
signing before a store release). `assembleRelease` makes one APK per ABI
(`app/build/outputs/apk/release/app-arm64-v8a-release.apk` is the one for phones); debug stays a
single APK.

## Releasing (in-app updates)

Phones check `android/latest.json` in the Cloudflare R2 bucket `munpilot-app` every 15 minutes
(WorkManager, `notify/BackgroundCheck.kt`) and on opening the app (at most every 30 minutes), then
offer the update and install it from Settings -> Software Update (`data/Updates.kt`). The website
mirrors the manifest at `/api/app/latest` and links the newest APK at `/download/android`
(`APP_RELEASES_URL` on the server).

1. Add the new version at the **top** of `app/src/main/assets/changelog.json` with the next
   `versionCode`. That entry sets the app's version and is what Settings -> What's New shows.
2. `node tools/release.mjs` builds, uploads the APKs, then uploads `latest.json` last.
   `--dry-run` prints the manifest only; `--skip-build` uploads the current build.

Every release must be signed with the same key as the installed app (today the debug key in
`%USERPROFILE%\.android\debug.keystore`; back it up), or phones refuse the update.

## Layout

- `data/` — Firebase repositories (`live/` = sessions, marking, papers, video tokens).
- `domain/` — pure models and logic ported from the web's services, covered by JUnit tests in
  `app/src/test`.
- `ui/` — Compose screens and the app's own component kit (`ui/kit`).

`PLAN.md` has the full rebuild plan and the screen-by-screen checklist.
