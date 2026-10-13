# Grind Dial-In: Expo app (testing build)

*Precision in every shot.* · Barista Life Ltd

This is the React Native / Expo version of Grind Dial-In. It runs on iPhone and Android, and is set up for App Store release through Expo (including Expo Launch).

## What's in this build

- **Welcome screen and plans:** Free, Pro and Business, with a Monthly/Annual switch, on black with the Fine Dot logo.
- **First run:** "Set up your grinder", or "Explore with sample shots" (16 example shots that don't count towards a plan).
- **Testing mode:** every plan is free; switch plans any time in Account. No payments.
- **Grinder registry:** each grinder gets its own ID. Known models (Mythos One, Compak E6) fill in their settings.
- **Dial-in screen:**
  - The grinder setting drawn on a dial gauge, with "Was 4.0½ · 1½ marks finer" and a one-line reason.
  - **Dose time** at equal size.
  - "If you don't move it" prediction.
  - **Pull it and log the shot** button.
  - + / − steppers for the conditions, workload, quick adjust (folded away), why this setting, and a last 12 shots chart.
- **Dial-in flow:** 1 Before the shot (grinder reading, dose time, dose weight, room), 2 Run it (extraction time, yield, taste), 3 Change (new grind and dose time, with dose time per notch set right under it).
- **History, Insights** ("Getting closer" week by week, "What moves your shot") and **Account** tabs. Grinder rules open from the Dial-in screen.
- **Plan limits:**
  - Free: 20 shots, 1 grinder.
  - Pro: 1 grinder.
  - Business: unlimited grinders.
  - On a downgrade, the app asks which grinder to keep. The others are archived read-only and restored when you upgrade again.
- **Calibration engine** in `src/engine/index.js`: the same maths as the web prototype, checked by `tests/engine.test.mjs`.

**Not in this build yet:** user accounts, cloud sync and team sharing (data is saved on the phone only), and real subscriptions.

## Try it on your phone

### Option A: on a computer (most reliable)

1. Install **Node.js** (LTS) from nodejs.org.
2. Install **Expo Go** on your iPhone from the App Store.
3. Unzip this folder, open Terminal in it, and run:
   ```
   npm install
   npx expo install --fix
   npx expo start
   ```
   `expo install --fix` lines the package versions up with the current Expo release.
4. Scan the QR code with the iPhone camera. The app opens in Expo Go.

### Option B: in the browser with Expo Snack (no install)

1. Go to **snack.expo.dev** and sign in.
2. Drag the project files into Snack, keeping the folder structure: `App.js`, `src/…`, `assets/…`.
3. Add the dependencies `@react-native-async-storage/async-storage` and `react-native-svg` when Snack asks.
4. Scan the QR code with Expo Go.

## Check the calibration maths

```
npm test
```

This runs the engine against results produced by the web prototype for the same shots (Mythos One and Compak E6 scenarios). It should print `All engine tests passed.`

## Project layout

```
App.js                     screens, tabs, plan changes
src/engine/index.js        calibration engine + membership rules (no UI code)
src/store.js               on-phone storage (swap for a backend at launch)
src/theme.js               Fine Dot colours on black
src/components/ui.js       shared fields, buttons, chips
src/components/visuals.js  dial gauge, shots chart, bars, tab icons, steppers
src/screens/               Welcome, Setup, DialIn, LogShot, History, Insights, Rules, Account, ArchivePick
assets/                    logo, app icon, splash
tests/engine.test.mjs      engine checks
```

## Road to the App Store

1. **Accounts and cloud data:** replace `src/store.js` with Supabase or Firebase (email sign-up, login, password recovery). Business team logs live here too.
2. **Subscriptions:** add RevenueCat (`react-native-purchases`). Read the plan from the RevenueCat entitlement instead of the testing switch, and check it on the server.
3. **Apple Developer account** for Barista Life Ltd ($99/year). Bundle ID is set to `com.baristalife.grinddialin` in `app.json`; change it if you prefer.
4. **Build and submit** with Expo Launch or EAS (`eas build`, `eas submit`).
5. **Independent review** before charging anyone: security, data protection (UK GDPR), subscriptions, and App Store guidelines.

## Notes for the developer

- The engine is plain JavaScript with no React imports, so it can also run on a server. Keep any change to it covered by `tests/engine.test.mjs`.
- Grind settings are stored as typed on the dial ("4.3" = number 4, mark 3). The engine converts using the grinder's "marks between numbers" rule.
- `usageText`, `reconcileGrinders`, `canRegisterGrinder` and `shotLimitReached` in the engine hold the plan rules, so the subscription layer only needs to supply the plan id.
