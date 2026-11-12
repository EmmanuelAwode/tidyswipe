import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, AppState, FlatList, Linking, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stats, getMonthProgress, getStats, kvGet, kvSet } from '../db/database';
import {
  Access, PhotoAsset, collectionTitle, countFor, firstAssetFor, formatBytes, getAccess,
  listMonths, manageLimited, monthLabel, requestAccess,
} from '../services/photos';
import { Theme, useTheme } from '../theme/theme';

type Tile = { key: string; title: string; count: number; preview: PhotoAsset | null; done: number };

const SMART = ['recents', 'random', 'onthisday', 'screenshots', 'videos'];

export default function Home() {
  const t = useTheme();
  const [access, setAccess] = useState<Access | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [smart, setSmart] = useState<Tile[]>([]);
  const [months, setMonths] = useState<Tile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const a = await getAccess();
    setAccess(a);
    if (a === 'denied' || a === 'undetermined') { setLoading(false); return; }
    try {
      if (months.length === 0) {
        const cached = await kvGet('home:months');
        if (cached) { setMonths(JSON.parse(cached)); setLoading(false); }
      }
      const [s, prog] = await Promise.all([getStats(), getMonthProgress()]);
      setStats(s);
      setTotal(await countFor('recents'));
      const smartTiles = await Promise.all(
        SMART.map(async (key) => ({
          key, title: collectionTitle(key),
          count: key === 'random' ? await countFor('recents') : await countFor(key),
          preview: key === 'random' ? null : await firstAssetFor(key),
          done: 0,
        })),
      );
      setSmart(smartTiles);
      const keys = await listMonths();
      // Counts and previews load lazily per tile below; start with placeholders.
      setMonths(keys.map((k) => ({ key: `month:${k}`, title: monthLabel(k), count: -1, preview: null, done: prog[k] ?? 0 })));
      setLoading(false);
      for (let i = 0; i < keys.length; i += 6) {
        const batch = keys.slice(i, i + 6);
        const filled = await Promise.all(batch.map(async (k) => ({
          k, count: await countFor(`month:${k}`), preview: await firstAssetFor(`month:${k}`),
        })));
        setMonths((prev) => prev.map((m) => {
          const f = filled.find((x) => `month:${x.k}` === m.key);
          return f ? { ...m, count: f.count, preview: f.preview, done: prog[f.k] ?? 0 } : m;
        }));
      }
      setMonths((cur) => { void kvSet('home:months', JSON.stringify(cur.map((m) => ({ ...m, preview: m.preview && { ...m.preview, mediaSubtypes: undefined } })))); return cur; });
    } catch {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void load());
    return () => sub.remove();
  }, [load]);

  if (access === null || loading) return <Center t={t}><ActivityIndicator /></Center>;

  if (access === 'denied' || access === 'undetermined') {
    return (
      <Center t={t}>
        <Text style={[styles.h1, { color: t.text }]}>Photo access needed</Text>
        <Text style={[styles.sub, { color: t.sub }]}>
          Tidyswipe works entirely on your iPhone. Photos are never uploaded.
        </Text>
        <Pressable style={[styles.btn, { backgroundColor: t.accent }]}
          onPress={async () => (access === 'denied' ? Linking.openSettings() : setAccess(await requestAccess()), void load())}>
          <Text style={styles.btnText}>{access === 'denied' ? 'Open Settings' : 'Allow access'}</Text>
        </Pressable>
      </Center>
    );
  }

  const pct = total ? Math.min(1, (stats?.reviewed ?? 0) / total) : 0;

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 18 }}>
        {access === 'limited' && (
          <Pressable onPress={() => manageLimited()} style={[styles.banner, { backgroundColor: t.card, borderColor: t.border }]}>
            <Text style={{ color: t.text }}>Limited access: only selected photos are visible. Tap to choose more.</Text>
          </Pressable>
        )}

        <View style={[styles.card, { backgroundColor: t.card }]}>
          <Text style={[styles.label, { color: t.sub }]}>CLEANUP PROGRESS</Text>
          <Text style={[styles.big, { color: t.text }]}>{Math.round(pct * 100)}%</Text>
          <Bar t={t} value={pct} />
          <View style={styles.row}>
            <Stat t={t} label="Library" value={total.toLocaleString()} />
            <Stat t={t} label="Reviewed" value={(stats?.reviewed ?? 0).toLocaleString()} />
            <Stat t={t} label="Cleaned" value={formatBytes(stats?.bytesCleaned ?? 0)} />
            <Stat t={t} label="Streak" value={`${stats?.streak ?? 0}d`} />
          </View>
        </View>

        {(stats?.pending ?? 0) > 0 && (
          <Pressable onPress={() => router.push('/review')} style={[styles.pending, { backgroundColor: t.del }]}>
            <Text style={styles.pendingText}>Review {stats!.pending} photos marked for deletion →</Text>
          </Pressable>
        )}

        <View style={styles.tools}>
          {([['Duplicates', '/duplicates'], ['Bookmarks', '/bookmarks'], ['Statistics', '/stats'], ['History', '/history'], ['Map', '/map']] as const).map(([label, href]) => (
            <Pressable key={href} onPress={() => router.push(href)} style={[styles.chip, { backgroundColor: t.card }]}>
              <Text style={{ color: t.text, fontWeight: '600' }}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.h2, { color: t.text }]}>Quick start</Text>
        <FlatList
          horizontal showsHorizontalScrollIndicator={false} data={smart} keyExtractor={(i) => i.key}
          contentContainerStyle={{ gap: 12 }}
          renderItem={({ item }) => <TileView t={t} tile={item} wide />}
        />

        <Text style={[styles.h2, { color: t.text }]}>Months</Text>
        <View style={styles.grid}>
          {months.map((m) => <TileView key={m.key} t={t} tile={m} />)}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TileView({ t, tile, wide }: { t: Theme; tile: Tile; wide?: boolean }) {
  const pct = tile.count > 0 ? Math.min(1, tile.done / tile.count) : 0;
  return (
    <Pressable
      onPress={() => (tile.key === 'videos' ? router.push('/videos') : router.push({ pathname: '/swipe', params: { key: tile.key } }))}
      style={[styles.tile, wide ? styles.tileWide : styles.tileGrid, { backgroundColor: t.card }]}
    >
      <View style={[styles.preview, { backgroundColor: t.track }]}>
        {tile.preview && <Image source={{ uri: tile.preview.uri }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={tile.key} />}
      </View>
      <Text numberOfLines={1} style={[styles.tileTitle, { color: t.text }]}>{tile.title}</Text>
      <Text style={{ color: t.sub, fontSize: 12 }}>{tile.count < 0 ? '…' : `${tile.count.toLocaleString()} items`}</Text>
      {!wide && <Bar t={t} value={pct} />}
    </Pressable>
  );
}

const Center = ({ t, children }: { t: Theme; children: React.ReactNode }) => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14, backgroundColor: t.bg }}>{children}</View>
);
const Bar = ({ t, value }: { t: Theme; value: number }) => (
  <View style={[styles.track, { backgroundColor: t.track }]}>
    <View style={{ width: `${value * 100}%`, height: '100%', backgroundColor: t.accent, borderRadius: 4 }} />
  </View>
);
const Stat = ({ t, label, value }: { t: Theme; label: string; value: string }) => (
  <View style={{ flex: 1 }}>
    <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>{value}</Text>
    <Text style={{ color: t.sub, fontSize: 11 }}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  h1: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  h2: { fontSize: 20, fontWeight: '700' },
  sub: { textAlign: 'center', fontSize: 15 },
  btn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  banner: { padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  card: { borderRadius: 24, padding: 18, gap: 10 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  big: { fontSize: 40, fontWeight: '800' },
  row: { flexDirection: 'row', marginTop: 6 },
  track: { height: 6, borderRadius: 4, overflow: 'hidden' },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14 },
  pending: { padding: 16, borderRadius: 18 },
  pendingText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  tile: { borderRadius: 20, padding: 10, gap: 4 },
  tileWide: { width: 150 },
  tileGrid: { width: '48%' },
  preview: { aspectRatio: 1, borderRadius: 14, overflow: 'hidden' },
  tileTitle: { fontWeight: '700', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
});
