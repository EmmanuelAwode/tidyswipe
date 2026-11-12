import * as ML from 'expo-media-library/legacy';
import { findSimilarGroups, getFileSizes } from '../../modules/photo-tools';
import { kvGet, kvPrefix, kvSet } from '../db/database';
import { monthRange } from './photos';

export type DupGroup = { ids: string[]; exact: boolean };
const PREFIX = 'dups:';

/** Ids for one month, oldest first, capped to keep a scan bounded in time and memory. */
async function monthIds(key: string, cap = 3000): Promise<string[]> {
  const r = monthRange(key);
  const ids: string[] = [];
  let after: string | undefined;
  while (ids.length < cap) {
    const page = await ML.getAssetsAsync({
      mediaType: ['photo'], first: 500, after,
      createdAfter: r.after, createdBefore: r.before,
      sortBy: [[ML.SortBy.creationTime, true]],
    });
    ids.push(...page.assets.map((a) => a.id));
    if (!page.hasNextPage) break;
    after = page.endCursor;
  }
  return ids;
}

/** Scans one month and stores the groups on-device. Returns null if the native module is missing. */
export async function scanMonth(key: string): Promise<DupGroup[] | null> {
  const ids = await monthIds(key);
  const raw = await findSimilarGroups(ids);
  if (raw === null) return null;
  const sizes = await getFileSizes(raw.flat());
  const groups: DupGroup[] = raw.map((g) => {
    const s = g.map((id) => sizes[id]);
    return { ids: g, exact: s.every((x) => x !== undefined && x === s[0]) };
  });
  await kvSet(PREFIX + key, JSON.stringify(groups));
  return groups;
}

export async function isScanned(key: string): Promise<boolean> {
  return (await kvGet(PREFIX + key)) !== null;
}

export async function loadAllGroups(): Promise<{ month: string; group: DupGroup }[]> {
  const rows = await kvPrefix(PREFIX);
  const out: { month: string; group: DupGroup }[] = [];
  for (const r of rows) {
    const groups = JSON.parse(r.value) as DupGroup[];
    groups.forEach((group) => out.push({ month: r.key.slice(PREFIX.length), group }));
  }
  return out.sort((a, b) => Number(b.group.exact) - Number(a.group.exact));
}

/** Removes a resolved group so it no longer shows up. */
export async function resolveGroup(month: string, firstId: string) {
  const raw = await kvGet(PREFIX + month);
  if (!raw) return;
  const groups = (JSON.parse(raw) as DupGroup[]).filter((g) => g.ids[0] !== firstId);
  await kvSet(PREFIX + month, JSON.stringify(groups));
}
