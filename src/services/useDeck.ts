import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getBookmarked, getMonthProgress, getReviewedSet, setDecision, toggleBookmark, undoDecision,
} from '../db/database';
import {
  CollectionKey, Loader, PhotoAsset, countFor, createLoader, monthKeyOf, sizesFor,
} from './photos';

const BUFFER = 8;

/**
 * Drives one review session: lazily pages through a collection, skips assets
 * that already have a decision (so reopening resumes where you left off) and
 * persists each swipe immediately.
 */
export function useDeck(key: CollectionKey, limit?: number) {
  const [queue, setQueue] = useState<PhotoAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [canUndo, setCanUndo] = useState(false);
  const [session, setSession] = useState({ keep: 0, del: 0 });

  const loader = useRef<Loader | null>(null);
  const filling = useRef(false);
  const undoStack = useRef<{ asset: PhotoAsset; dir: 'keep' | 'delete' }[]>([]);
  const queueRef = useRef<PhotoAsset[]>([]);
  queueRef.current = queue;

  const fill = useCallback(async () => {
    if (filling.current || !loader.current) return;
    filling.current = true;
    try {
      while (queueRef.current.length < BUFFER && !loader.current.done) {
        const page = await loader.current.next();
        const seen = await getReviewedSet(page.map((a) => a.id));
        const fresh = page.filter((a) => !seen.has(a.id));
        if (fresh.length) {
          const bm = await getBookmarked(fresh.map((a) => a.id));
          setBookmarks((prev) => new Set([...prev, ...bm]));
          queueRef.current = [...queueRef.current, ...fresh];
          setQueue(queueRef.current);
        }
      }
      if (loader.current.done) setExhausted(true);
    } finally {
      filling.current = false;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      loader.current = createLoader(key);
      const t = await countFor(key);
      if (!alive) return;
      setTotal(t);
      if (key.startsWith('month:')) {
        const prog = await getMonthProgress();
        setRemaining(Math.max(0, t - (prog[key.slice(6)] ?? 0)));
      }
      await fill();
      if (alive) setLoading(false);
    })().catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [key, fill]);

  // Warm the image cache for the next few cards so swipes never wait on a decode.
  useEffect(() => {
    const next = queue.slice(1, 6).map((a) => a.uri);
    if (next.length) void Image.prefetch(next, 'memory-disk');
  }, [queue]);

  const decide = useCallback(async (dir: 'keep' | 'delete') => {
    const asset = queueRef.current[0];
    if (!asset) return;
    Haptics.impactAsync(
      dir === 'keep' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
    );
    undoStack.current.push({ asset, dir });
    setSession((x) => (dir === 'keep' ? { ...x, keep: x.keep + 1 } : { ...x, del: x.del + 1 }));
    queueRef.current = queueRef.current.slice(1);
    setQueue(queueRef.current);
    setCanUndo(true);
    setRemaining((r) => (r === null ? r : Math.max(0, r - 1)));
    const size = (await sizesFor([asset]))[asset.id] ?? 0;
    await setDecision(asset.id, dir, size, monthKeyOf(asset.creationTime));
    if (queueRef.current.length < BUFFER) void fill();
  }, [fill]);

  const undo = useCallback(async () => {
    const last = undoStack.current.pop();
    if (!last) return;
    const { asset, dir } = last;
    setSession((x) => (dir === 'keep' ? { ...x, keep: x.keep - 1 } : { ...x, del: x.del - 1 }));
    Haptics.selectionAsync();
    await undoDecision(asset.id);
    queueRef.current = [asset, ...queueRef.current];
    setQueue(queueRef.current);
    setCanUndo(undoStack.current.length > 0);
    setRemaining((r) => (r === null ? r : r + 1));
  }, []);

  const bookmark = useCallback(async () => {
    const asset = queueRef.current[0];
    if (!asset) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const on = await toggleBookmark(asset.id);
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (on) next.add(asset.id); else next.delete(asset.id);
      return next;
    });
  }, []);

  const done = session.keep + session.del;
  const finished = !!limit && done >= limit;
  return { session, finished, done, queue, loading, exhausted, remaining, total, bookmarks, canUndo, decide, undo, bookmark };
}
