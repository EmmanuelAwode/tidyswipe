# Tidyswipe

A private photo cleaner for your phone. Swipe right to keep, swipe left to delete, and clear out your camera roll a batch at a time. Everything runs on the device: no account, no uploads, no ads.

## Features

- **Swipe to sort:** nothing is deleted when you swipe. Deletions wait in a queue until you review and confirm them.
- **Sessions:** random photos, random videos or a mix, in batches of 10 to 100.
- **Collections:** recents, on this day, screenshots, large videos, and every month of your library.
- **Videos:** autoplay on the card with sound, a seek bar and fullscreen.
- **Undo, bookmarks and history:** reverse any decision before it is deleted.
- **Progress:** how much of the library you have reviewed, space freed and your streak.
- **iOS extras (native build only):** duplicate detection with Apple's Vision framework, real file sizes and a photo map.

## Install

### Android

Download `Tidyswipe.apk` from the [latest release](../../releases/latest) on your phone and open it. Android asks you to allow installs from your browser the first time.

### iPhone

Apple does not allow installing apps from a download link. The options are in [INSTALL.md](INSTALL.md): Expo Go for trying it out, AltStore with a free Apple ID (re-signed every 7 days), or an Apple Developer account.

## Develop

```bash
npm install
```

```bash
npx expo start
```

Scan the QR code with Expo Go. Built with Expo SDK 58, React Native, TypeScript, Expo Router, SQLite and Reanimated.

## Builds

- `.github/workflows/build-apk.yml` builds the Android APK and publishes it as a release.
- `.github/workflows/build-ipa.yml` builds an unsigned iOS IPA for sideloading.

## Privacy

Tidyswipe has no backend. Photos, decisions and statistics never leave the device.
