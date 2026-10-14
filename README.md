# Dial In: Expo app (testing build)

*Precision in every shot.* · Barista Life Ltd

This is the React Native / Expo version of Dial In. It runs on iPhone and Android, and is set up for App Store release through Expo (including Expo Launch).

## What's in this build

- **Welcome screen and plans:** Free, Pro and Business, with a Monthly/Annual switch. Testing mode: every plan is free, switch any time in Account.
- **Two operating modes** on the Dial In tab:
  - **Dial in a new coffee:** choose or create a coffee → confirm the dose (18 g default, fixed for the run, warning outside a tolerance) → targets (36 g, 28–32 s from pump on) → shot by shot until the time is in the band → **Save calibration**.
  - **Adjust existing coffee:** pick a coffee with a saved calibration → "Is your grinder still at 6.5?" → room temperature and humidity (if the grinder has a gauge) → predicted setting and doser time before the first shot → verify with a shot.
- **Every recommendation** shows the grind move, doser time to hold the target dose, a Confidence level (Low / Moderate / High), and what it is based on: initial calibration guidance, previously observed grinder behaviour, or historical environmental data.
- **Coffee profiles:** name, roaster, origin, roast date; optional producer, variety, process, roast level, altitude, notes. Calibrations belong to one grinder + coffee and are never applied to another grinder. Coffees can be archived.
- **Grinder profiles:** each grinder keeps its own history (two of the same model are separate). Settings screen has the dial layout, benchmarks, the temperature/humidity gauge yes/no, and **Recalibrate** after a burr change or service.
- **History** (with predicted vs actual), **Insights** (what moves your shot, benchmark vs measured, prediction accuracy) and **Account** tabs.
- **Data from the first build carries over:** typed coffee names become coffee profiles, and the latest in-band shot for each grinder + coffee becomes its saved calibration.

## The calculation engine (`src/engine/index.js`)

- **Grind response k** (extraction seconds per number) is fitted from that grinder's shots for the coffee. Before it is measured, the app borrows it from the grinder's other coffees, else uses the 10 s benchmark with a cautious half step (max ½ a number).
- **Grind move** = (target time − expected time) ÷ k, from the grinder's confirmed current position, in quarter marks, max one number per shot. Inside the target band = hold.
- **Room temperature (s per °C) and humidity (s per % RH)** are separate terms. Each starts at the benchmark (1 number per 4 °C; 12 % RH = 1 °C) and is replaced by the measured value as shots build. It is labelled "measured" once about 8 shots span 3 °C (or 15 % RH) and the two haven't simply moved together.
- **Doser time** = target dose ÷ grind rate (g/s, measured from weighed doses) at the new setting.
- Missing readings are never filled in; a grinder without a gauge ignores room conditions entirely. Older shots count less (30-day half-life) and a recalibration starts a fresh history.

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
   The app targets **Expo SDK 57** (React Native 0.86), which is what the current Expo Go needs. `expo install --fix` lines the other packages (react-native-svg, async-storage) up with SDK 57.
4. Scan the QR code with the iPhone camera. The app opens in Expo Go.

### Option B: in the browser with Expo Snack (no install)

Note: Snack currently only offers up to SDK 55, so its QR code won't open in an Expo Go that has updated to SDK 57. Use Option A for Expo Go.

1. Go to **snack.expo.dev** and sign in.
2. Drag the project files into Snack, keeping the folder structure: `App.js`, `src/…`, `assets/…`.
3. Add the dependencies `@react-native-async-storage/async-storage` and `react-native-svg` when Snack asks.
4. Scan the QR code with Expo Go.

## Check the calibration maths

```
npm test
```

This checks the engine: the brief's 6.5 → 38 s / 6.7 → 33 s example, temperature-only, humidity-only and both, no invented readings, no-gauge grinders, grinder moved since saving, doser time, and plan rules. It should print `All 14 engine tests passed.`

## Project layout

```
App.js                     tabs, the two modes, plan changes
src/engine/index.js        calibration engine + membership rules (no UI code)
src/model.js               data helpers: migration, calibrations, recalibration, samples
src/store.js               on-phone storage and the data model (swap for a backend at launch)
src/theme.js               Fine Dot colours on black
src/components/ui.js       shared fields, buttons, chips
src/components/visuals.js  dial gauge, shots chart, bars, tab icons, steppers
src/screens/               Welcome, Setup, Home, NewCoffee, Adjust, ShotLoop, History, Insights, Rules, Account, ArchivePick
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
