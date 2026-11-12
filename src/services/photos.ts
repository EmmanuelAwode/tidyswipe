import * as ML from 'expo-media-library/legacy';
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
    { recents: 'Recents', random: 'Random', onthisday: 'On This Day', screenshots: 'Screenshots', videos: 'Large Videos' } as Record<string, string>
  )[key] ?? key;
}

function baseOptions(key: CollectionKey): ML.AssetsOptions {
  const opts: ML.AssetsOptions = {
    mediaType: ['photo', 'video'],
    sortBy: [[ML.SortBy.creationTime, false]],
  };
  if (key === 'screenshots') {
    opts.mediaType = ['photo'];
    opts.mediaSubtypes = ['screenshot'];
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
  const page = await ML.getAssetsAsync({ ...baseOptions(key), first: 1 });
  return page.totalCount;
}

export async function firstAssetFor(key: CollectionKey): Promise<PhotoAsset | null> {
  if (key === 'onthisday') return (await createLoader(key).next())[0] ?? null;
  const page = await ML.getAssetsAsync({ ...baseOptions(key), first: 1 });
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
export function createLoader(key: CollectionKey, pageSize = 60): Loader {
  if (key === 'onthisday') return onThisDayLoader();
  if (key === 'random') return randomLoader(pageSize);
  let cursor: string | undefined;
  const loader: Loader = {
    done: false,
    async next() {
      if (loader.done) return [];
      const page = await ML.getAssetsAsync({ ...baseOptions(key), first: pageSize, after: cursor });
      cursor = page.endCursor;
      loader.done = !page.hasNextPage;
      return page.assets;
    },
  };
  return loader;
}

function randomLoader(pageSize: number): Loader {
  let queue: string[] | null = null;
  let current: Loader | null = null;
  const loader: Loader = {
    done: false,
    async next() {
      if (!queue) queue = shuffle(await listMonths());
      while (!current || current.done) {
        const m = queue.pop();
        if (!m) {
          loader.done = true;
          return [];
        }
        current = createLoader(`month:${m}`, pageSize);
      }
      return shuffle(await current.next());
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

/** Real size via the native PhotoKit module; falls back to an estimate (e.g. in Expo Go). */
export async function sizesFor(assets: PhotoAsset[]): Promise<Record<string, number>> {
  const real = await getFileSizes(assets.map((a) => a.id));
  const out: Record<string, number> = {};
  for (const a of assets) out[a.id] = real[a.id] ?? estimateSize(a);
  return out;
}

export async function getInfo(id: string) {
  return ML.getAssetInfoAsync(id, { shouldDownloadFromNetwork: false });
}

export function formatBytes(n: number): string {
  if (n < 1e6) return `${Math.round(n / 1e3)} KB`;
  if (n < 1e9) return `${(n / 1e6).toFixed(n < 1e8 ? 1 : 0)} MB`;
  return `${(n / 1e9).toFixed(2)} GB`;
}
