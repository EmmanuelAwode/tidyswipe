import { router, useFocusEffect } from 'expo-router';
import { LastError, clearLastError, getLastError } from '../../services/crash';
import React, { useCallback, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hasPhotoTools } from '../../../modules/photo-tools';
import { Stats, getStats } from '../../db/database';
import { openCollection } from '../../services/nav';
import { formatBytes } from '../../services/photos';
import { useTheme } from '../../theme/theme';
import { Row } from './index';

export default function More() {
  const t = useTheme();
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState<LastError | null>(null);
  useFocusEffect(useCallback(() => {
    void getStats().then(setS).catch(() => {});
    void getLastError().then(setErr);
  }, []));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.h1, { color: t.text }]}>More</Text>

        <View style={styles.stats}>
          <Stat t={t} value={(s?.deletedCount ?? 0).toLocaleString()} label="deleted" />
          <Stat t={t} value={formatBytes(s?.bytesCleaned ?? 0)} label="freed" />
          <Stat t={t} value={(s?.kept ?? 0).toLocaleString()} label="kept" />
        </View>

        <Text style={[styles.h2, { color: t.sub }]}>YOUR CLEANUP</Text>
        <View style={[styles.list, { backgroundColor: t.card }]}>
          <Row t={t} icon="trash.fill" tint={t.del} title="Waiting to be deleted" detail={`${s?.pending ?? 0}`} onPress={() => router.push('/review')} />
          <Row t={t} icon="arrow.uturn.backward" tint="#5B8DEF" title="Undo history" onPress={() => router.push('/history')} />
          <Row t={t} icon="chart.bar.fill" tint="#30B0C7" title="Statistics" onPress={() => router.push('/stats')} last />
        </View>

        <Text style={[styles.h2, { color: t.sub }]}>YOUR LIBRARY</Text>
        <View style={[styles.list, { backgroundColor: t.card }]}>
          <Row t={t} icon="bookmark.fill" tint="#F5A524" title="Bookmarks" onPress={() => router.push('/bookmarks')} />
          {Platform.OS === 'ios' && (
            <Row t={t} icon="map.fill" tint="#34C759" title="Photo map" onPress={() => router.push('/map')} />
          )}
          {hasPhotoTools && (
            <Row t={t} icon="square.on.square" tint="#FF6B6B" title="Duplicate scan" onPress={() => router.push('/duplicates')} />
          )}
          <Row t={t} icon="film.fill" tint="#BF5AF2" title="Large videos" onPress={() => openCollection('videos')} last />
        </View>

        {err && (
          <Pressable
            onPress={() => Alert.alert('Last problem', `${err.text}\n\n${new Date(err.at).toLocaleString()}`, [
              { text: 'Clear', onPress: () => { void clearLastError(); setErr(null); } },
              { text: 'Close', style: 'cancel' },
            ])}
            style={[styles.list, { backgroundColor: t.card, padding: 14 }]}
          >
            <Text style={{ color: t.del, fontWeight: '700' }}>The app recorded a problem</Text>
            <Text style={{ color: t.sub, fontSize: 12 }} numberOfLines={2}>{err.text}</Text>
          </Pressable>
        )}

        <Text style={{ color: t.sub, fontSize: 12, textAlign: 'center', marginTop: 8 }}>
          Everything stays on this device. No account, no uploads.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const Stat = ({ t, value, label }: { t: ReturnType<typeof useTheme>; value: string; label: string }) => (
  <View style={[styles.stat, { backgroundColor: t.card }]}>
    <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>{value}</Text>
    <Text style={{ color: t.sub, fontSize: 12 }}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 32, gap: 12 },
  h1: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  h2: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, marginTop: 12, marginLeft: 6 },
  stats: { flexDirection: 'row', gap: 10, marginTop: 4 },
  stat: { flex: 1, borderRadius: 18, paddingVertical: 16, alignItems: 'center', gap: 2 },
  list: { borderRadius: 22, overflow: 'hidden' },
});
