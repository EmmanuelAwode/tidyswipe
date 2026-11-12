import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { HistoryRow, getHistory, undoDecision } from '../db/database';
import { useTheme } from '../theme/theme';

export default function History() {
  const t = useTheme();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const load = useCallback(() => { void getHistory().then(setRows); }, []);
  useFocusEffect(load);

  return (
    <FlatList
      data={rows}
      keyExtractor={(r, i) => `${r.asset_id}-${r.at}-${i}`}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      ListEmptyComponent={<Text style={{ color: t.sub, textAlign: 'center' }}>No swipes yet.</Text>}
      renderItem={({ item }) => {
        const deleted = item.current === 'deleted';
        return (
          <View style={[styles.row, { backgroundColor: t.card }]}>
            <Image source={{ uri: `ph://${item.asset_id}` }} style={styles.thumb} contentFit="cover" />
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
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 18 },
  thumb: { width: 52, height: 52, borderRadius: 10 },
});
