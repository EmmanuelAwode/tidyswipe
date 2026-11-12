import * as SQLite from 'expo-sqlite';

export type Decision = 'keep' | 'delete' | 'deleted';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('tidyswipe.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS decisions (
          asset_id TEXT PRIMARY KEY NOT NULL,
          decision TEXT NOT NULL,
          size INTEGER NOT NULL DEFAULT 0,
          month_key TEXT,
          bookmarked INTEGER NOT NULL DEFAULT 0,
          decided_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_decisions_decision ON decisions(decision);
        CREATE INDEX IF NOT EXISTS idx_decisions_month ON decisions(month_key);
        CREATE TABLE IF NOT EXISTS history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          asset_id TEXT NOT NULL,
          decision TEXT NOT NULL,
          at INTEGER NOT NULL,
          day TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS deleted_log (
          asset_id TEXT PRIMARY KEY NOT NULL,
          size INTEGER NOT NULL,
          at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS completed_months (
          month_key TEXT PRIMARY KEY NOT NULL,
          completed_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT);
      `);
      return db;
    })();
  }
  return dbPromise;
}

const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

export async function setDecision(
  assetId: string,
  decision: 'keep' | 'delete',
  size: number,
  monthKey: string | null,
) {
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    // Preserve an existing bookmark when a decision is recorded.
    await db.runAsync(
      `INSERT INTO decisions (asset_id, decision, size, month_key, bookmarked, decided_at)
       VALUES (?, ?, ?, ?, 0, ?)
       ON CONFLICT(asset_id) DO UPDATE SET decision = excluded.decision,
         size = excluded.size, month_key = excluded.month_key, decided_at = excluded.decided_at`,
      assetId, decision, size, monthKey, now,
    );
    await db.runAsync(
      'INSERT INTO history (asset_id, decision, at, day) VALUES (?, ?, ?, ?)',
      assetId, decision, now, dayKey(now),
    );
  });
}

/**
 * Undo: the asset becomes unreviewed again. A bookmarked asset keeps its row
 * (so the bookmark survives) but with an empty month_key it counts as unreviewed.
 */
export async function undoDecision(assetId: string) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "DELETE FROM decisions WHERE asset_id = ? AND decision != 'deleted' AND bookmarked = 0",
      assetId,
    );
    await db.runAsync(
      "UPDATE decisions SET decision = 'undecided', month_key = NULL WHERE asset_id = ? AND decision IN ('keep','delete')",
      assetId,
    );
    await db.runAsync(
      'DELETE FROM history WHERE id = (SELECT MAX(id) FROM history WHERE asset_id = ?)',
      assetId,
    );
  });
}

/** Returns the subset of `ids` that already have a real decision. */
export async function getReviewedSet(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (ids.length === 0) return out;
  const db = await getDb();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = await db.getAllAsync<{ asset_id: string }>(
      `SELECT asset_id FROM decisions WHERE decision != 'undecided' AND asset_id IN (${chunk
        .map(() => '?')
        .join(',')})`,
      chunk,
    );
    rows.forEach((r) => out.add(r.asset_id));
  }
  return out;
}

export async function getBookmarked(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (ids.length === 0) return out;
  const db = await getDb();
  const rows = await db.getAllAsync<{ asset_id: string }>(
    `SELECT asset_id FROM decisions WHERE bookmarked = 1 AND asset_id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );
  rows.forEach((r) => out.add(r.asset_id));
  return out;
}

export async function toggleBookmark(assetId: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ bookmarked: number }>(
    'SELECT bookmarked FROM decisions WHERE asset_id = ?',
    assetId,
  );
  const next = row?.bookmarked ? 0 : 1;
  await db.runAsync(
    `INSERT INTO decisions (asset_id, decision, size, month_key, bookmarked, decided_at)
     VALUES (?, 'undecided', 0, NULL, ?, ?)
     ON CONFLICT(asset_id) DO UPDATE SET bookmarked = excluded.bookmarked`,
    assetId, next, Date.now(),
  );
  return next === 1;
}

export type PendingRow = { asset_id: string; size: number };

export async function getPending(): Promise<PendingRow[]> {
  const db = await getDb();
  return db.getAllAsync<PendingRow>(
    "SELECT asset_id, size FROM decisions WHERE decision = 'delete' ORDER BY decided_at DESC",
  );
}

/** Removing from the queue returns the asset to 'keep'. */
export async function removeFromPending(assetId: string) {
  const db = await getDb();
  await db.runAsync(
    "UPDATE decisions SET decision = 'keep' WHERE asset_id = ? AND decision = 'delete'",
    assetId,
  );
}

export async function markDeleted(rows: PendingRow[]) {
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const r of rows) {
      await db.runAsync("UPDATE decisions SET decision = 'deleted' WHERE asset_id = ?", r.asset_id);
      await db.runAsync(
        'INSERT OR REPLACE INTO deleted_log (asset_id, size, at) VALUES (?, ?, ?)',
        r.asset_id, r.size, now,
      );
    }
  });
}

/** Assets that no longer exist in the library are dropped from the queue. */
export async function dropMissing(ids: string[]) {
  const db = await getDb();
  for (const id of ids) await db.runAsync('DELETE FROM decisions WHERE asset_id = ?', id);
}

export type Stats = {
  reviewed: number;
  kept: number;
  deletedCount: number;
  bytesCleaned: number;
  pending: number;
  streak: number;
};

export async function getStats(): Promise<Stats> {
  const db = await getDb();
  const one = async (sql: string) => (await db.getFirstAsync<{ n: number }>(sql))?.n ?? 0;
  const reviewed = await one("SELECT COUNT(*) AS n FROM decisions WHERE decision != 'undecided'");
  const kept = await one("SELECT COUNT(*) AS n FROM decisions WHERE decision = 'keep'");
  const deletedCount = await one('SELECT COUNT(*) AS n FROM deleted_log');
  const bytesCleaned = await one('SELECT COALESCE(SUM(size),0) AS n FROM deleted_log');
  const pending = await one("SELECT COUNT(*) AS n FROM decisions WHERE decision = 'delete'");

  const days = await db.getAllAsync<{ day: string }>('SELECT DISTINCT day FROM history');
  const set = new Set(days.map((d) => d.day));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const cursor = new Date();
  if (!set.has(fmt(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (set.has(fmt(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return { reviewed, kept, deletedCount, bytesCleaned, pending, streak };
}

export async function getMonthProgress(): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ month_key: string; n: number }>(
    "SELECT month_key, COUNT(*) AS n FROM decisions WHERE month_key IS NOT NULL AND decision != 'undecided' GROUP BY month_key",
  );
  return Object.fromEntries(rows.map((r) => [r.month_key, r.n]));
}

// ---------- Key/value, bookmarks, history ----------

export async function kvGet(key: string): Promise<string | null> {
  const db = await getDb();
  return (await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key))?.value ?? null;
}
export async function kvSet(key: string, value: string) {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', key, value);
}
export async function kvPrefix(prefix: string): Promise<{ key: string; value: string }[]> {
  const db = await getDb();
  return db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM kv WHERE substr(key, 1, ?) = ?',
    prefix.length,
    prefix,
  );
}

export async function getBookmarkList(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ asset_id: string }>(
    'SELECT asset_id FROM decisions WHERE bookmarked = 1 ORDER BY decided_at DESC',
  );
  return rows.map((r) => r.asset_id);
}

export type HistoryRow = { asset_id: string; decision: string; at: number; current: string | null };

/** Latest swipe decisions, with the asset's current state so deleted ones aren't revertible. */
export async function getHistory(limit = 60): Promise<HistoryRow[]> {
  const db = await getDb();
  return db.getAllAsync<HistoryRow>(
    `SELECT h.asset_id, h.decision, h.at, d.decision AS current
     FROM history h LEFT JOIN decisions d ON d.asset_id = h.asset_id
     ORDER BY h.id DESC LIMIT ?`, limit,
  );
}

export async function monthsCompleted(): Promise<number> {
  const db = await getDb();
  return (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM completed_months'))?.n ?? 0;
}
