# Tidyswipe

A private photo cleaner for your phone. Swipe right to keep, swipe left to delete, and clear out your camera roll a batch at a time. Everything runs on the device: no account, no uploads, no ads.

- [Install on Android](#install-on-android)
- [Install on iPhone](#install-on-iphone)
- [How to use it](#how-to-use-it)
- [Troubleshooting](#troubleshooting)
- [For developers](#for-developers)

## Install on Android

1. On your Android phone, open the [latest release](../../releases/latest).
2. Under **Assets**, tap **Tidyswipe.apk** to download it.
3. Open the downloaded file. The first time, Android says your browser isn't allowed to install apps: tap **Settings**, turn on **Allow from this source**, then go back.
4. Tap **Install**, then **Open**.
5. When Tidyswipe asks for access to your photos and videos, choose **Allow all**. If you choose limited access, it only sees the items you pick.

Play Protect may show a warning because the app isn't from the Play Store. Tap **Install anyway** (sometimes under **More details**).

To update, download the newer `Tidyswipe.apk` and install it over the old one. Your progress is kept.

Works on Android 7 and later.

## Install on iPhone

Apple does not allow installing apps from a download link, so there is no file to tap. The options are:

| Method | Cost | Lasts | Needs |
| --- | --- | --- | --- |
| Expo Go | Free | While your computer runs the dev server | A computer with this project |
| AltStore / SideStore | Free | 7 days, then re-sign | A computer and an Apple ID |
| Apple Developer account | $99 a year | 1 year per build | Apple Developer membership |

Step-by-step instructions for each are in [INSTALL.md](INSTALL.md).

## How to use it

### The three tabs

- **Clean:** your progress, and where you start a session.
- **Months:** your library month by month, with how many are left in each.
- **More:** your deletion queue, undo history, statistics and bookmarks.

### Swiping

Every collection opens the same deck.

- **Swipe right** or tap the tick to **keep**.
- **Swipe left** or tap the cross to mark for **deletion**.
- **Undo** (left button) takes back your last swipe, as many times as you like.
- **Bookmark** (right button) saves an item to look at later.

The buttons on the card itself are **Details** (file name, size, date), **Fullscreen** and **Share**. Videos play on the card with sound, and the bar under the card lets you pause, scrub and mute.

### Nothing is deleted until you confirm

Swiping left only adds an item to a queue. To actually delete:

1. Tap the red counter at the top of the deck, or **Waiting to be deleted** in the More tab.
2. Check the items. Tap any one to view it full size and choose **Keep it** to take it out of the queue.
3. Tap **Delete** and confirm. Your phone then asks once more before anything is removed.

On iPhone, deleted items go to **Recently Deleted** in Photos for 30 days. On Android, deletion is permanent.

### Collections

- **Random photos / Random videos / Random mix:** pick a batch of 10 to 100 from across your whole library. When a batch is done you can delete what you marked and go straight on to the next batch.
- **Recents:** newest first.
- **On this day:** today's date in previous years.
- **Screenshots:** on Android, this is the album named Screenshots.
- **Large videos:** longest first, with the length and approximate size of each.
- **Similar shots:** photos of the same size taken within a few seconds of each other, shown back to back so you can keep the best one.
- **Months:** tap any month in the Months tab. A green tick means it is finished.

### Viewing and sharing

Tap an item in **Bookmarks**, the deletion queue or the undo history to open it full size. Swipe sideways to move through the list. Tap **Done** to close (on iPhone you can also swipe down; on Android use Back).

The **Share** button opens your phone's normal share sheet. Large videos take a moment to prepare.

## Troubleshooting

**"Photo access needed" won't go away.** Open your phone's Settings, find Tidyswipe, and allow access to photos and videos.

**The library looks nearly empty.** You probably chose limited access. Tap the notice at the top of the Clean tab, or change it in Settings.

**A video is black or won't play.** On iPhone it may be stored in iCloud and not downloaded. Open it once in the Photos app.

**Share says it could not share.** The original isn't on the phone (iCloud only), or the phone is short on space for the temporary copy.

**Sizes look rough.** On Android and in the installed iPhone build sizes are exact. In Expo Go on iPhone they are estimates.

**Screenshots is empty on Android.** Your phone stores screenshots in an album with a different name. They still appear in Recents and Months.

## For developers

```bash
npm install
```

```bash
npx expo start
```

Scan the QR code with Expo Go. Built with Expo SDK 58, React Native, TypeScript, Expo Router, SQLite and Reanimated.

### Builds

- **Android:** `.github/workflows/build-apk.yml` builds the APK, installs it on an emulator, walks through the app with `.github/scripts/smoke.py`, and publishes a release. Run it from the **Actions** tab (**Build Android APK** → **Run workflow**) or push a tag such as `v1.0.0`.
- **iPhone:** `.github/workflows/build-ipa.yml` builds an unsigned IPA for sideloading.

### What differs by platform

| Feature | iPhone (installed build) | iPhone (Expo Go) | Android |
| --- | --- | --- | --- |
| Swiping, queue, undo, bookmarks, share | Yes | Yes | Yes |
| Exact file sizes | Yes | Estimates | Yes |
| Similar shots | Yes | Yes | Yes |
| Duplicate scan (Apple Vision) | Yes | No | No |
| Photo map | Yes | Newest 400 items | No |

## Privacy

Tidyswipe has no backend. Photos, decisions and statistics never leave the device. Sharing only happens when you tap Share and pick where to send something.
