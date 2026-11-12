# Installing Tidyswipe on your own iPhone (from Windows)

Facts from Apple's signing rules, as I understand them. Prices and free-tier limits change; verify them before paying.

## Expo Go vs development build vs production build
| | Expo Go | Development build | Standalone (release) build |
|---|---|---|---|
| What it is | Apple-signed app from Expo containing a fixed set of native modules | Your app + `expo-dev-client`, needs Metro to load JS | Your app with JS bundled inside |
| Runs without PC/Metro | No | No | **Yes** |
| Custom native code (`modules/photo-tools`) | No | Yes | Yes |
| Real photo library | Partly, with Expo Go's own permission strings | Yes | Yes |
| Needs signing | No | Yes | Yes |

Expo Go is fine for a first look at the UI. It is not the real app: the Swift module is absent, so sizes are estimates there.

## Methods compared
| Method | Needs Mac | Works from Windows | Paid Apple account | Re-signing | Offline / no Metro |
|---|---|---|---|---|---|
| **1. EAS Build (cloud Mac) + internal/ad hoc install** | No | Yes | **Yes ($99/yr)** | Valid ~1 year (profile expiry) | Yes |
| 2. Ad hoc via Developer Program (manual) | Not if built in the cloud | Yes with EAS | Yes | ~1 year | Yes |
| 3. Development build on registered iPhone | No (EAS) | Yes | Yes | ~1 year | **No** (needs Metro) |
| 4. Xcode + free Apple ID | **Yes** | **No** | No | **Every 7 days** | Yes |
| 5. AltStore / SideStore + free Apple ID | No | Yes (AltServer for Windows) | No | **Every 7 days**, max 3 apps | Yes |
| 6. EU alternative marketplaces / web distribution | No | n/a | Developer Program still required, EU only | varies | Yes |

Key points:
- Generating an IPA is not installing it. An IPA must be signed with a certificate and a provisioning profile that includes your iPhone, or re-signed by AltStore with your free Apple ID.
- **Recommended: EAS Build + a paid Apple Developer account.** It's the only route that is Windows-friendly, gives a standalone app, and does not expire weekly. Cost: $99/year (EAS free tier has a monthly build quota; check expo.dev/pricing).
- **Free alternative: unsigned IPA from a free GitHub Actions macOS runner, installed with AltStore.** No cost, but the app expires every 7 days and must be refreshed (SideStore can refresh on-device after one-time setup, AltStore needs AltServer on your PC on the same Wi-Fi). Photo library access works under a free account. Your data in SQLite survives refreshes as long as you don't delete the app.
- No method gives a permanent install on a free Apple ID. I won't promise one.
- Method 6 is not practical for personal use even in the EU.

## Recommended steps (paid account)
```bash
npm install -g eas-cli
eas login
eas device:create          # registers your iPhone (opens a profile on the phone)
eas build --platform ios --profile personal
```
EAS asks for your Apple ID and creates the certificate and ad hoc profile. When the build finishes, open the install link on the iPhone. Enable **Settings → Privacy & Security → Developer Mode** first (iOS 16+).

## Checklist after installing
1. Launch with Wi-Fi off and PC shut down (no Metro).
2. Grant Photos access; check months and previews load.
3. Swipe, mark a photo for deletion, confirm on the Review screen, accept the iOS prompt.
4. Force-quit, reopen: progress and the pending queue are still there.

## Running during development
```bash
npm install
npx expo start      # Expo Go for UI, or after `eas build --profile development` for the full app
```

---

## Phase 4 runbook (steps only you can do: they need your Apple/Expo logins)

Already verified on Windows: `expo-doctor` passes 20/20, `tsc` is clean, `expo export --platform ios` bundles the JS, and autolinking finds the local `PhotoTools` Swift module. Not verifiable on Windows: the Swift compiling, signing, and anything on-device.

1. **Apple Developer Program**: enrol at developer.apple.com/programs ($99/yr). Approval can take a day or two.
2. **Bundle ID**: `com.personal.tidyswipe` in `app.json`. Change it to something unique to you before the first build (it can't be changed cheaply later).
3. **Expo account + CLI** (free):
   ```bash
   npm install -g eas-cli
   eas login
   eas init
   ```
4. **Register your iPhone** (opens a link to install a profile on the phone):
   ```bash
   eas device:create
   ```
5. **Build and sign** (EAS asks for your Apple ID and manages the certificate and ad hoc profile; enter credentials in the terminal yourself):
   ```bash
   eas build --platform ios --profile personal
   ```
6. **Install**: open the build's install link in Safari on the iPhone. Turn on **Settings → Privacy & Security → Developer Mode** (iPhone restarts) if the app won't open.
7. **If the Swift module fails to compile**, the EAS build log names the line; paste it to me and I'll fix it.

### Verification checklist
- [ ] Launches with Wi-Fi/cellular off and the PC off (no Expo Go, no Metro)
- [ ] Photos permission prompt appears; months, counts and previews load
- [ ] Swipe left/right works; haptics fire; Undo restores the card
- [ ] Mark one test photo, open Review, delete; iOS confirmation appears; photo lands in Recently Deleted
- [ ] Force-quit and reopen: reviewed photos are skipped, queue and stats persist
- [ ] Duplicates scan runs (needs this build, not Expo Go); Map shows pins
- [ ] Try with "Limited" photo access to confirm the banner and picker work

Tip: for the first test, use a month with few photos and delete only throwaway shots.

---

## Free route: unsigned IPA + AltStore (no Apple Developer fee)

1. Create a **private** GitHub repo, push this project (`git init`, `git add .`, `git commit`, `git remote add origin ...`, `git push`).
2. GitHub → **Actions → Build unsigned IPA → Run workflow**. It runs on a macOS runner and uploads `Tidyswipe.ipa` as an artifact (about 15 to 30 minutes). If it fails, download the `build-log` artifact and send it to me.
3. On Windows install **iTunes and iCloud from apple.com (not the Microsoft Store versions)**, then **AltServer for Windows** (altstore.io). Connect the iPhone, trust the PC, enable Wi-Fi sync.
4. Use AltServer's tray menu → *Install AltStore* → choose your iPhone, enter your own Apple ID in AltServer's dialog.
5. On the iPhone: trust your developer profile (Settings → General → VPN & Device Management) and enable Developer Mode.
6. Download the IPA from GitHub on the iPhone (or AirDrop/transfer it), open it in AltStore → *My Apps → +*. AltStore signs it with your free Apple ID.
7. **Every 7 days** the app expires. AltStore refreshes it automatically if AltServer is running on the PC on the same Wi-Fi; SideStore can refresh on-device after one-time setup. A free Apple ID allows 3 active sideloaded apps.

Limits to expect: the 7-day expiry is Apple's rule and cannot be avoided on a free account. Your SQLite progress survives refreshes, but not deleting the app.
