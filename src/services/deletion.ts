import * as ML from 'expo-media-library/legacy';
import { dropMissing, markDeleted, PendingRow } from '../db/database';

export type DeleteResult = { deleted: number; cancelled: boolean };

/**
 * Deletes the given pending assets. iOS shows its own system confirmation
 * sheet; if the user declines it nothing is deleted and the queue is kept.
 * Call this only after the user confirmed on the review screen.
 */
export async function deletePending(rows: PendingRow[]): Promise<DeleteResult> {
  if (rows.length === 0) return { deleted: 0, cancelled: false };

  // Skip assets that were already removed elsewhere (e.g. in the Photos app).
  const missing = new Set<string>();
  for (const r of rows) {
    try {
      const info = await ML.getAssetInfoAsync(r.asset_id, { shouldDownloadFromNetwork: false });
      if (!info) missing.add(r.asset_id);
    } catch {
      missing.add(r.asset_id);
    }
  }
  if (missing.size) await dropMissing([...missing]);
  const live = rows.filter((r) => !missing.has(r.asset_id));
  if (live.length === 0) return { deleted: 0, cancelled: false };

  let ok = false;
  try {
    ok = await ML.deleteAssetsAsync(live.map((r) => r.asset_id));
  } catch {
    ok = false;
  }
  if (!ok) return { deleted: 0, cancelled: true };
  await markDeleted(live);
  return { deleted: live.length, cancelled: false };
}
