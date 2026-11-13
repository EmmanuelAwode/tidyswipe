import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MediaViewer } from '../components/MediaViewer';
import { PendingRow, getPending, removeFromPending } from '../db/database';
import { deletePending } from '../services/deletion';
import { formatBytes, uriForId } from '../services/photos';
import { useTheme } from '../theme/theme';

export default function Review() {
  const t = useTheme();
  const [rows, setRows] = useState<PendingRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => setRows(await getPending()), []);
  useEffect(() => { void load(); }, [load]);

  if (!rows) return <View style={styles.center}><ActivityIndicator /></View>;

  const bytes = rows.reduce((s, r) => s + r.size, 0);

  const confirm = () =>
    Alert.alert(
      `Delete ${rows.length} item${rows.length === 1 ? '' : 's'}?`,
      `About ${formatBytes(bytes)} will be freed. ${Platform.OS === 'ios'
        ? 'iOS will ask you to confirm, and deleted items stay in Recently Deleted for 30 days.'
        : 'Android will ask you to confirm. This cannot be undone.'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const res = await deletePending(rows);
              if (res.cancelled) {
                Alert.alert('Nothing deleted', 'The deletion was cancelled. Your queue is unchanged.');
              } else {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                router.back();
              }
            } finally {
              setBusy(false);
              void load();
            }
          },
        },
      ],
    );

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
      <View style={styles.summary}>
        <Text style={[styles.big, { color: t.text }]}>{rows.length} selected</Text>
        <Text style={{ color: t.sub }}>≈ {formatBytes(bytes)} to recover</Text>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.asset_id}
        numColumns={3}
        contentContainerStyle={{ padding: 8 }}
        ListEmptyComponent={<Text style={{ color: t.sub, textAlign: 'center', marginTop: 40 }}>Nothing marked for deletion.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.cell} onPress={() => setOpen(item.asset_id)} accessibilityRole="button" accessibilityLabel="View item">
            <Image source={{ uri: uriForId(item.asset_id) }} style={styles.thumb} contentFit="cover" recyclingKey={item.asset_id} />
          </Pressable>
        )}
      />
      <MediaViewer
        ids={rows.map((r) => r.asset_id)}
        id={open}
        onClose={() => setOpen(null)}
        actions={(id) => [
          { label: 'Keep it', icon: 'checkmark', color: t.keep, then: 'removed', onPress: async () => { await removeFromPending(id); await load(); } },
          { label: 'Still delete', icon: 'trash.fill', color: t.del, onPress: () => {} },
        ]}
      />
      <View style={styles.actions}>
        <Pressable onPress={() => router.back()} style={[styles.btn, { backgroundColor: t.card }]}>
          <Text style={{ color: t.text, fontWeight: '700' }}>Cancel</Text>
        </Pressable>
        <Pressable
          disabled={rows.length === 0 || busy} onPress={confirm}
          style={[styles.btn, { backgroundColor: t.del, opacity: rows.length === 0 || busy ? 0.4 : 1 }]}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? 'Deleting…' : 'Delete'}</Text>
        </Pressable>
      </View>
      <Text style={[styles.hint, { color: t.sub }]}>Tap an item to view it and decide again.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  summary: { padding: 16, gap: 2 },
  big: { fontSize: 28, fontWeight: '800' },
  cell: { width: '33.33%', aspectRatio: 1, padding: 3 },
  thumb: { flex: 1, borderRadius: 10 },
  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 8 },
  btn: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center' },
  hint: { textAlign: 'center', fontSize: 12, padding: 8 },
});
