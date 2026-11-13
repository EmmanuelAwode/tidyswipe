import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';
import { getInfo } from './photos';

const DIR = `${FS.cacheDirectory}share/`;

/**
 * Opens the system share sheet for a photo or video from the library.
 * The original is copied to the app's cache first, because other apps can't be
 * handed a file inside the photo library directly. Nothing is uploaded by Tidyswipe.
 */
export async function shareAsset(id: string): Promise<void> {
  try {
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
    const info = await getInfo(id);
    if (!info) throw new Error('This item is no longer in your library.');

    // Start clean so old copies never pile up.
    await FS.deleteAsync(DIR, { idempotent: true });
    await FS.makeDirectoryAsync(DIR, { intermediates: true });
    const name = (info.filename || `${id}.${info.mediaType === 'video' ? 'mp4' : 'jpg'}`).replace(/[^\w.\-]+/g, '_');
    const to = DIR + name;
    await FS.copyAsync({ from: Platform.OS === 'ios' ? `ph://${id}` : info.localUri ?? info.uri, to });
    await Sharing.shareAsync(to);
  } catch (e) {
    Alert.alert('Could not share', (e as Error).message || 'Something went wrong preparing this item.');
  }
}
