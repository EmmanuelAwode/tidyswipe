import { requireOptionalNativeModule } from 'expo-modules-core';

type PhotoToolsNative = {
  getFileSizes(ids: string[]): Promise<Record<string, number>>;
  findSimilarGroups(ids: string[], threshold: number, window: number): Promise<string[][]>;
  getGeotagged(limit: number): Promise<GeoPoint[]>;
};
export type GeoPoint = { id: string; lat: number; lng: number };

/** Newest geotagged photos/videos. Returns null when the native module is unavailable. */
export async function getGeotagged(limit = 5000): Promise<GeoPoint[] | null> {
  if (!native) return null;
  return native.getGeotagged(limit);
}
const native = requireOptionalNativeModule<PhotoToolsNative>('PhotoTools');

export const hasPhotoTools = native !== null;

/** Real file sizes in bytes. Returns {} when the native module is unavailable (e.g. Expo Go). */
export async function getFileSizes(ids: string[]): Promise<Record<string, number>> {
  if (!native || ids.length === 0) return {};
  try {
    return await native.getFileSizes(ids);
  } catch {
    return {};
  }
}

/** Vision-based similarity groups. Returns null when the native module is unavailable. */
export async function findSimilarGroups(
  ids: string[],
  threshold = 0.35,
  window = 25,
): Promise<string[][] | null> {
  if (!native) return null;
  if (ids.length < 2) return [];
  return native.findSimilarGroups(ids, threshold, window);
}
