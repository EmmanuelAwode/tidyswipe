import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stats, getStats } from '../db/database';
import { formatBytes } from '../services/photos';
import { useTheme } from '../theme/theme';

export default function StatsScreen() {
  const t = useTheme();
  const [s, setS] = useState<Stats | null>(null);
  useFocusEffect(useCallback(() => { void getStats().then(setS); }, []));
  if (!s) return null;

  const cards: [string, string][] = [
    ['Reviewed', s.reviewed.toLocaleString()],
    ['Kept', s.kept.toLocaleString()],
    ['Deleted', s.deletedCount.toLocaleString()],
    ['Space recovered', formatBytes(s.bytesCleaned)],
    ['Waiting for confirmation', s.pending.toLocaleString()],
    ['Cleanup streak', `${s.streak} day${s.streak === 1 ? '' : 's'}`],
  ];
  return (
    <ScrollView contentContainerStyle={styles.grid}>
      {cards.map(([label, value]) => (
        <View key={label} style={[styles.card, { backgroundColor: t.card }]}>
          <Text style={{ color: t.text, fontSize: 26, fontWeight: '800' }}>{value}</Text>
          <Text style={{ color: t.sub }}>{label}</Text>
        </View>
      ))}
      <Text style={{ color: t.sub, fontSize: 12, width: '100%', textAlign: 'center', marginTop: 8 }}>
        Sizes are real file sizes in the installed build and estimates in Expo Go. All stats stay on this device.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16 },
  card: { width: '47.5%', padding: 18, borderRadius: 20, gap: 4 },
});
