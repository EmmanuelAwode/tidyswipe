import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getFileSizes } from '../../modules/photo-tools';
import { setDecision } from '../db/database';
import { DupGroup, loadAllGroups, resolveGroup } from '../services/duplicates';
import { formatBytes } from '../services/photos';
import { useTheme } from '../theme/theme';

export default function Compare() {
  const t = useTheme();
  const { month, first } = useLocalSearchParams<{ month: string; first: string }>();
  const [group, setGroup] = useState<DupGroup | null>(null);
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [keeper, setKeeper] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const g = (await loadAllGroups()).find((x) => x.month === month && x.group.ids[0] === first)?.group;
      if (!g) return router.back();
      const s = await getFileSizes(g.ids);
      setGroup(g);
      setSizes(s);
      // Suggest the largest file (usually the highest quality); the user can change it.
      setKeeper([...g.ids].sort((a, b) => (s[b] ?? 0) - (s[a] ?? 0))[0]);
    })();
  }, [month, first]);

  if (!group) return <View style={styles.center}><ActivityIndicator /></View>;

  const finish = async (keepAll: boolean) => {
    for (const id of group.ids) {
      const del = !keepAll && id !== keeper;
      await setDecision(id, del ? 'delete' : 'keep', sizes[id] ?? 0, month);
    }
    await resolveGroup(month, first);
    router.back();
  };

  const others = group.ids.length - 1;
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
      <Text style={[styles.hint, { color: t.sub }]}>Tap the photo you want to keep.</Text>
      <ScrollView contentContainerStyle={styles.grid}>
        {group.ids.map((id) => (
          <Pressable key={id} style={styles.cell} onPress={() => setKeeper(id)}>
            <Image
              source={{ uri: `ph://${id}` }}
              style={[styles.img, { borderColor: id === keeper ? t.keep : 'transparent' }]}
              contentFit="cover"
            />
            <Text style={{ color: t.sub, fontSize: 12, textAlign: 'center' }}>
              {id === keeper ? '✓ Keep · ' : ''}{sizes[id] ? formatBytes(sizes[id]) : ''}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.actions}>
        <Pressable onPress={() => finish(true)} style={[styles.btn, { backgroundColor: t.card }]}>
          <Text style={{ color: t.text, fontWeight: '700' }}>Keep all</Text>
        </Pressable>
        <Pressable onPress={() => finish(false)} style={[styles.btn, { backgroundColor: t.del }]}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Queue {others} for deletion</Text>
        </Pressable>
      </View>
      <Text style={[styles.hint, { color: t.sub }]}>Queued photos are only deleted after you confirm on the review screen.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint: { textAlign: 'center', padding: 8, fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 8 },
  cell: { width: '50%', padding: 6, gap: 4 },
  img: { aspectRatio: 3 / 4, borderRadius: 14, borderWidth: 4 },
  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 16 },
  btn: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center' },
});
