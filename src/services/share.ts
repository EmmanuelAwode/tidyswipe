import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';
import { getInfo } from './photos';

const DIR = `${FS.cacheDirectory}share/`;

/** Rejects if a step hangs, so the button can never spin forever. */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what} timed out`)), ms)),
  ]);
}

/**
 * Opens the system share sheet for a photo or video from the library.
 * The original is copied to the app's cache first, because other apps can't be
 * handed a file inside the photo library directly. Nothing is uploaded by Tidyswipe.
 */
export async function shareAsset(id: string): Promise<void> {
  let step = 'start';
  try {
    step = 'check sharing';
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
    step = 'read item';
    const info = await getInfo(id);
    if (!info) throw new Error('This item is no longer in your library.');

    step = 'prepare folder';
    await FS.deleteAsync(DIR, { idempotent: true }); // start clean so old copies never pile up
    await FS.makeDirectoryAsync(DIR, { intermediates: true });
    const name = (info.filename || `${id}.${info.mediaType === 'video' ? 'mp4' : 'jpg'}`).replace(/[^\w.\-]+/g, '_');
    const to = DIR + name;

    step = 'copy file';
    const from = Platform.OS === 'ios' ? `ph://${id}` : info.localUri ?? info.uri;
    await withTimeout(FS.copyAsync({ from, to }), 120_000, 'Copying the file');

    step = 'open share sheet';
    await Sharing.shareAsync(to);
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    console.warn(`[share] failed at "${step}": ${msg}`);
    Alert.alert('Could not share', msg);
  }
}
