import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hasPhotoTools } from '../../modules/photo-tools';
import { DupGroup, isScanned, loadAllGroups, scanMonth } from '../services/duplicates';
import { listMonths, monthLabel } from '../services/photos';
import { useTheme } from '../theme/theme';

type Item = { month: string; group: DupGroup };

export default function Duplicates() {
  const t = useTheme();
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState('');
  const [scanning, setScanning] = useState(false);
  const stop = useRef(false);

  useFocusEffect(useCallback(() => { void loadAllGroups().then(setItems); }, []));

  const scan = async () => {
    stop.current = false;
    setScanning(true);
    try {
      const months = await listMonths();
      for (let i = 0; i < months.length && !stop.current; i++) {
        const m = months[i];
        setStatus(`Scanning ${monthLabel(m)} (${i + 1}/${months.length})`);
        if (await isScanned(m)) continue; // already done; results are stored on-device
        if ((await scanMonth(m)) === null) { setStatus('Needs the installed build (not Expo Go).'); break; }
        setItems(await loadAllGroups());
      }
      if (!stop.current) setStatus('Scan complete');
    } catch (e) {
      setStatus(`Scan failed: ${(e as Error).message}`);
    } finally {
      setScanning(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
      <View style={styles.head}>
        <Text style={{ color: t.sub }}>
          Finds similar photos on-device using Apple Vision. Nothing is ever deleted automatically.
        </Text>
        <Pressable
          onPress={scanning ? () => { stop.current = true; } : scan}
          style={[styles.btn, { backgroundColor: t.accent }]}
        >
          <Text style={styles.btnText}>{scanning ? 'Stop' : 'Scan library'}</Text>
        </Pressable>
        {!!status && <Text style={{ color: t.sub, fontSize: 12 }}>{status}</Text>}
        {!hasPhotoTools && <Text style={{ color: t.del, fontSize: 12 }}>Native module missing: scanning needs a development or release build.</Text>}
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.group.ids[0]}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={<Text style={{ color: t.sub, textAlign: 'center' }}>No duplicate groups yet.</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/duplicate', params: { month: item.month, first: item.group.ids[0] } })}
            style={[styles.row, { backgroundColor: t.card }]}
          >
            <View style={styles.thumbs}>
              {item.group.ids.slice(0, 3).map((id) => (
                <Image key={id} source={{ uri: `ph://${id}` }} style={styles.thumb} contentFit="cover" />
              ))}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: '700' }}>{item.group.ids.length} photos</Text>
              <Text style={{ color: t.sub, fontSize: 12 }}>
                {item.group.exact ? 'Exact duplicates' : 'Visually similar'} · {monthLabel(item.month)}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  head: { padding: 16, gap: 10 },
  btn: { padding: 14, borderRadius: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 18 },
  thumbs: { flexDirection: 'row', gap: 4 },
  thumb: { width: 56, height: 56, borderRadius: 10 },
});
