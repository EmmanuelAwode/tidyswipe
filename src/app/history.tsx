import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { MediaViewer } from '../components/MediaViewer';
import { HistoryRow, getHistory, undoDecision } from '../db/database';
import { useTheme } from '../theme/theme';
import { uriForId } from '../services/photos';

export default function History() {
  const t = useTheme();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => { void getHistory().then(setRows); }, []);
  useFocusEffect(load);

  return (
    <>
    <FlatList
      data={rows}
      keyExtractor={(r, i) => `${r.asset_id}-${r.at}-${i}`}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      ListEmptyComponent={<Text style={{ color: t.sub, textAlign: 'center' }}>No swipes yet.</Text>}
      renderItem={({ item }) => {
        const deleted = item.current === 'deleted';
        return (
          <View style={[styles.row, { backgroundColor: t.card }]}>
            <Pressable disabled={deleted} onPress={() => setOpen(item.asset_id)} accessibilityRole="button" accessibilityLabel="View item">
              <Image source={{ uri: uriForId(item.asset_id) }} style={styles.thumb} contentFit="cover" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ color: item.decision === 'keep' ? t.keep : t.del, fontWeight: '700' }}>
                {item.decision === 'keep' ? 'Kept' : 'Marked for deletion'}
              </Text>
              <Text style={{ color: t.sub, fontSize: 12 }}>
                {new Date(item.at).toLocaleString()}{deleted ? ' · deleted' : ''}
              </Text>
            </View>
            {!deleted && (
              <Pressable
                onPress={() => Alert.alert('Reverse this decision?', 'The photo returns to your unreviewed pile.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Reverse', onPress: async () => { await undoDecision(item.asset_id); load(); } },
                ])}
              >
                <Text style={{ color: t.accent, fontWeight: '700' }}>Undo</Text>
              </Pressable>
            )}
          </View>
        );
      }}
    />
    <MediaViewer
      id={open}
      onClose={() => setOpen(null)}
      actions={open ? [{ label: 'Undo decision', icon: 'arrow.uturn.backward', onPress: async () => { await undoDecision(open); load(); } }] : []}
    />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 18 },
  thumb: { width: 52, height: 52, borderRadius: 10 },
});
