import * as FS from 'expo-file-system/legacy';
import * as ML from 'expo-media-library/legacy';
import { Platform } from 'react-native';
import { getFileSizes } from '../../modules/photo-tools';

export type Access = 'all' | 'limited' | 'denied' | 'undetermined';
export type PhotoAsset = ML.Asset;

function mapAccess(p: ML.PermissionResponse): Access {
  if (p.accessPrivileges === 'limited') return 'limited';
  if (p.granted) return 'all';
  return p.canAskAgain ? 'undetermined' : 'denied';
}
export async function getAccess(): Promise<Access> {
  return mapAccess(await ML.getPermissionsAsync());
}
export async function requestAccess(): Promise<Access> {
  return mapAccess(await ML.requestPermissionsAsync());
}
export const manageLimited = () => ML.presentPermissionsPickerAsync();

/** Image source for an asset we only know by id. iOS: PhotoKit; Android: MediaStore. */
export const uriForId = (id: string) =>
  Platform.OS === 'ios' ? `ph://${id}` : `content://media/external/file/${id}`;
/** Playable source for a video. iOS only grants access through PhotoKit (ph://). */
export const videoUriOf = (a: { id: string; uri: string }) => (Platform.OS === 'ios' ? `ph://${a.id}` : a.uri);

// Android has no "screenshot" subtype; screenshots live in an album called Screenshots.
let shotsAlbum: Promise<string | null> | null = null;
function screenshotsAlbum(): Promise<string | null> {
  shotsAlbum ??= ML.getAlbumsAsync()
    .then((all) => all.find((a) => a.title.toLowerCase() === 'screenshots')?.id ?? null)
    .catch(() => null);
  return shotsAlbum;
}

// ---------- Collections ----------
// Keys: 'recents' | 'random' | 'onthisday' | 'screenshots' | 'videos' | 'month:YYYY-MM'
export type CollectionKey = string;

export function monthKeyOf(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function monthRange(key: string) {
  const [y, m] = key.split('-').map(Number);
  return { after: new Date(y, m - 1, 1).getTime(), before: new Date(y, m, 1).getTime() - 1 };
}
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
export function collectionTitle(key: CollectionKey): string {
  if (key.startsWith('month:')) return monthLabel(key.slice(6));
  return (
    { recents: 'Recents', random: 'Random mix', 'random:photo': 'Random photos', 'random:video': 'Random videos', onthisday: 'On This Day', screenshots: 'Screenshots', videos: 'Large videos', similar: 'Similar shots' } as Record<string, string>
  )[key] ?? key;
}

export const isRandom = (key: CollectionKey) => key === 'random' || key.startsWith('random:');
type Media = 'photo' | 'video';
const mediaOf = (key: CollectionKey): Media | undefined =>
  key === 'random:photo' ? 'photo' : key === 'random:video' ? 'video' : undefined;

async function baseOptions(key: CollectionKey, media?: Media): Promise<ML.AssetsOptions> {
  const opts: ML.AssetsOptions = {
    mediaType: media ? [media] : ['photo', 'video'],
    sortBy: [[ML.SortBy.creationTime, false]],
  };
  if (key === 'screenshots') {
    opts.mediaType = ['photo'];
    if (Platform.OS === 'ios') opts.mediaSubtypes = ['screenshot'];
    else {
      const album = await screenshotsAlbum();
      // No Screenshots album: match nothing rather than the whole library.
      if (album) opts.album = album;
      else opts.createdBefore = 1;
    }
  } else if (key === 'videos') {
    opts.mediaType = ['video'];
    opts.sortBy = [[ML.SortBy.duration, false]]; // longest first, a proxy for largest
  } else if (key.startsWith('month:')) {
    const r = monthRange(key.slice(6));
    opts.createdAfter = r.after;
    opts.createdBefore = r.before;
  }
  return opts;
}

/** Cheap: PhotoKit returns the count without loading the assets. */
export async function countFor(key: CollectionKey): Promise<number> {
  if (key === 'onthisday') {
    const l = await createLoader(key).next();
    return l.length;
  }
  if (key === 'similar') return 0; // unknown until the library has been walked
  if (isRandom(key)) {
    const m = mediaOf(key);
    return (await ML.getAssetsAsync({ ...(await baseOptions('recents', m)), first: 1 })).totalCount;
  }
  const page = await ML.getAssetsAsync({ ...(await baseOptions(key)), first: 1 });
  return page.totalCount;
}

export async function firstAssetFor(key: CollectionKey): Promise<PhotoAsset | null> {
  if (key === 'onthisday') return (await createLoader(key).next())[0] ?? null;
  const page = await ML.getAssetsAsync({ ...(await baseOptions(isRandom(key) ? 'recents' : key, mediaOf(key))), first: 1 });
  return page.assets[0] ?? null;
}

/** Lists months with assets using two queries, then one count per month. No full scan. */
export async function listMonths(): Promise<string[]> {
  const common = { mediaType: ['photo', 'video'] as ML.MediaTypeValue[], first: 1 };
  const newest = await ML.getAssetsAsync({ ...common, sortBy: [[ML.SortBy.creationTime, false]] });
  const oldest = await ML.getAssetsAsync({ ...common, sortBy: [[ML.SortBy.creationTime, true]] });
  if (!newest.assets[0] || !oldest.assets[0]) return [];
  const end = new Date(newest.assets[0].creationTime);
  const start = new Date(oldest.assets[0].creationTime);
  const keys: string[] = [];
  let y = end.getFullYear();
  let m = end.getMonth();
  while (y > start.getFullYear() || (y === start.getFullYear() && m >= start.getMonth())) {
    keys.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    if (--m < 0) {
      m = 11;
      y--;
    }
  }
  return keys;
}

export type Loader = { next(): Promise<PhotoAsset[]>; done: boolean };

/** Paged loader: fetches one page at a time; the library is never loaded whole. */
export function createLoader(key: CollectionKey, pageSize = 60, media?: Media): Loader {
  if (key === 'onthisday') return onThisDayLoader();
  if (key === 'similar') return similarLoader();
  if (isRandom(key)) return randomLoader(pageSize, mediaOf(key));
  let cursor: string | undefined;
  const loader: Loader = {
    done: false,
    async next() {
      if (loader.done) return [];
      const page = await ML.getAssetsAsync({ ...(await baseOptions(key, media)), first: pageSize, after: cursor });
      cursor = page.endCursor;
      loader.done = !page.hasNextPage;
      return page.assets;
    },
  };
  return loader;
}

/**
 * Random across the whole library: each call draws a few items from several
 * randomly chosen months, so a batch of 30 is spread over many dates.
 */
function randomLoader(pageSize: number, media?: Media): Loader {
  let pool: string[] | null = null;
  const state = new Map<string, { loader: Loader; buf: PhotoAsset[] }>();
  const loader: Loader = {
    done: false,
    async next() {
      if (!pool) pool = await listMonths();
      const out: PhotoAsset[] = [];
      let guard = 0;
      while (out.length < 20 && pool.length > 0 && guard++ < 40) {
        const i = Math.floor(Math.random() * pool.length);
        const m = pool[i];
        let st = state.get(m);
        if (!st) {
          st = { loader: createLoader(`month:${m}`, pageSize, media), buf: [] };
          state.set(m, st);
        }
        if (st.buf.length === 0 && !st.loader.done) st.buf = shuffle(await st.loader.next());
        if (st.buf.length === 0) {
          pool.splice(i, 1); // month used up (or has no matching media)
          continue;
        }
        out.push(...st.buf.splice(0, 4));
      }
      if (pool.length === 0) loader.done = true;
      return shuffle(out);
    },
  };
  return loader;
}

/**
 * Near-duplicates without any native code: photos with the same dimensions taken
 * within a few seconds of each other (bursts, retakes, repeated screenshots).
 * Walks the library newest first and yields each run together, so the similar
 * shots arrive back to back in the deck.
 */
function similarLoader(): Loader {
  let cursor: string | undefined;
  let run: PhotoAsset[] = [];
  const loader: Loader = {
    done: false,
    async next() {
      if (loader.done) return [];
      const out: PhotoAsset[] = [];
      // Keep paging until something turns up, so the deck is not starved by long stretches of unique photos.
      while (out.length === 0 && !loader.done) {
        const page = await ML.getAssetsAsync({
          mediaType: ['photo'], first: 500, after: cursor, sortBy: [[ML.SortBy.creationTime, false]],
        });
        for (const a of page.assets) {
          const last = run[run.length - 1];
          const same = last && last.width === a.width && last.height === a.height
            && Math.abs(last.creationTime - a.creationTime) <= 4000;
          if (same) run.push(a);
          else {
            if (run.length > 1) out.push(...run);
            run = [a];
          }
        }
        cursor = page.endCursor;
        if (!page.hasNextPage) {
          if (run.length > 1) out.push(...run);
          run = [];
          loader.done = true;
        }
      }
      return out;
    },
  };
  return loader;
}

function onThisDayLoader(): Loader {
  const loader: Loader = {
    done: false,
    async next() {
      loader.done = true;
      const now = new Date();
      const out: PhotoAsset[] = [];
      for (let y = now.getFullYear() - 1; y >= now.getFullYear() - 25; y--) {
        const after = new Date(y, now.getMonth(), now.getDate()).getTime();
        const page = await ML.getAssetsAsync({
          mediaType: ['photo', 'video'],
          createdAfter: after,
          createdBefore: after + 86_400_000 - 1,
          first: 200,
          sortBy: [[ML.SortBy.creationTime, false]],
        });
        out.push(...page.assets);
      }
      return out;
    },
  };
  return loader;
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Sizes & details ----------

export function estimateSize(a: PhotoAsset): number {
  if (a.mediaType === 'video') return Math.round((a.duration || 1) * 2_500_000);
  return Math.round(a.width * a.height * 0.35);
}

/** Real size via the native PhotoKit module on iOS or the file itself on Android; otherwise an estimate (e.g. Expo Go on iPhone). */
export async function sizesFor(assets: PhotoAsset[]): Promise<Record<string, number>> {
  const real = await getFileSizes(assets.map((a) => a.id));
  const out: Record<string, number> = {};
  for (const a of assets) {
    let size = real[a.id];
    if (size === undefined && Platform.OS === 'android') {
      try {
        const f = await FS.getInfoAsync(a.uri);
        if (f.exists && f.size) size = f.size;
      } catch {
        // fall through to the estimate
      }
    }
    out[a.id] = size ?? estimateSize(a);
  }
  return out;
}

export async function getInfo(id: string) {
  return ML.getAssetInfoAsync(id, { shouldDownloadFromNetwork: false });
}

/** false only when the library says the item is gone; a lookup error is treated as "still there". */
export async function assetExists(id: string): Promise<boolean> {
  try {
    return !!(await ML.getAssetInfoAsync(id, { shouldDownloadFromNetwork: false }));
  } catch {
    return true;
  }
}

export function formatBytes(n: number): string {
  if (n < 1e6) return `${Math.round(n / 1e3)} KB`;
  if (n < 1e9) return `${(n / 1e6).toFixed(n < 1e8 ? 1 : 0)} MB`;
  return `${(n / 1e9).toFixed(2)} GB`;
}
