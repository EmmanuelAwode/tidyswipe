import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Tap } from '../../components/ui';
import { getMonthProgress, kvGet, kvSet } from '../../db/database';
import { openCollection } from '../../services/nav';
import { countFor, firstAssetFor, listMonths } from '../../services/photos';
import { useTheme } from '../../theme/theme';

type Month = { key: string; count: number; uri: string | null; done: number };
const CACHE = 'months:v2';
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function Months() {
  const t = useTheme();
  const [months, setMonths] = useState<Month[]>([]);
  const loading = useRef(false);

  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const prog = await getMonthProgress();
      const cached = await kvGet(CACHE);
      const known: Record<string, Month> = {};
      if (cached) (JSON.parse(cached) as Month[]).forEach((m) => { known[m.key] = m; });

      const keys = await listMonths();
      // Show cached tiles immediately, then refresh counts and previews in small batches.
      let cur: Month[] = keys.map((k) => ({ ...(known[k] ?? { key: k, count: -1, uri: null }), key: k, done: prog[k] ?? 0 }));
      setMonths(cur);
      for (let i = 0; i < keys.length; i += 6) {
        const part = await Promise.all(keys.slice(i, i + 6).map(async (k) => ({
          key: k,
          count: await countFor(`month:${k}`),
          uri: (await firstAssetFor(`month:${k}`))?.uri ?? null,
          done: prog[k] ?? 0,
        })));
        const byKey = Object.fromEntries(part.map((p) => [p.key, p]));
        cur = cur.map((m) => byKey[m.key] ?? m);
        setMonths(cur);
      }
      await kvSet(CACHE, JSON.stringify(cur));
    } catch {
      // keep whatever is on screen
    } finally {
      loading.current = false;
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // Group into years, three tiles per row.
  const sections = useMemo(() => {
    const years = new Map<string, Month[]>();
    for (const m of months) {
      if (m.count === 0) continue; // nothing to review in an empty month
      const y = m.key.slice(0, 4);
      years.set(y, [...(years.get(y) ?? []), m]);
    }
    return [...years.entries()].map(([title, items]) => {
      const rows: Month[][] = [];
      for (let i = 0; i < items.length; i += 3) rows.push(items.slice(i, i + 3));
      return { title, data: rows };
    });
  }, [months]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <SectionList
        sections={sections}
        keyExtractor={(row) => row[0].key}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<Text style={[styles.h1, { color: t.text }]}>Months</Text>}
        ListEmptyComponent={<Text style={{ color: t.sub, marginTop: 24 }}>Loading your library…</Text>}
        renderSectionHeader={({ section }) => <Text style={[styles.year, { color: t.text }]}>{section.title}</Text>}
        renderItem={({ item: row }) => (
          <View style={styles.rowWrap}>
            {row.map((m) => {
              const pct = m.count > 0 ? Math.min(1, m.done / m.count) : 0;
              const complete = pct >= 1;
              return (
                <Tap key={m.key} onPress={() => openCollection(`month:${m.key}`)} label={m.key} hitSlop={0} style={styles.tile}>
                  <View style={[styles.thumb, { backgroundColor: t.card }]}>
                    {m.uri && <Image source={{ uri: m.uri }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={m.key} transition={150} />}
                    {complete && (
                      <View style={[styles.done, { backgroundColor: t.keep }]}>
                        <Icon name="checkmark" size={11} color="#fff" />
                      </View>
                    )}
                    {pct > 0 && !complete && (
                      <View style={styles.bar}>
                        <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: '#fff' }} />
                      </View>
                    )}
                  </View>
                  <Text style={{ color: t.text, fontWeight: '700', marginTop: 6 }}>{SHORT[Number(m.key.slice(5)) - 1]}</Text>
                  <Text style={{ color: t.sub, fontSize: 12 }}>
                    {m.count < 0 ? ' ' : complete ? 'Done' : `${Math.max(0, m.count - m.done).toLocaleString()} left`}
                  </Text>
                </Tap>
              );
            })}
            {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => <View key={i} style={styles.tile} />)}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  year: { fontSize: 20, fontWeight: '700', marginTop: 22, marginBottom: 10 },
  rowWrap: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  tile: { flex: 1 },
  thumb: { aspectRatio: 1, borderRadius: 18, overflow: 'hidden' },
  done: { position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  bar: { position: 'absolute', left: 8, right: 8, bottom: 8, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
});
