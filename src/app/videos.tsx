import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ML from 'expo-media-library/legacy';
import { MediaViewer } from '../components/MediaViewer';
import { getReviewedSet, setDecision } from '../db/database';
import { PhotoAsset, formatBytes, monthKeyOf, sizesFor } from '../services/photos';
import { useTheme } from '../theme/theme';

type Row = { asset: PhotoAsset; size: number };

export default function LargeVideos() {
  const t = useTheme();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [queued, setQueued] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Row | null>(null);

  useEffect(() => {
    (async () => {
      // Longest 300 videos, then ranked by real file size.
      const page = await ML.getAssetsAsync({
        mediaType: ['video'], first: 300, sortBy: [[ML.SortBy.duration, false]],
      });
      const seen = await getReviewedSet(page.assets.map((a) => a.id));
      const assets = page.assets.filter((a) => !seen.has(a.id));
      const sizes = await sizesFor(assets);
      setRows(assets.map((asset) => ({ asset, size: sizes[asset.id] })).sort((a, b) => b.size - a.size));
    })();
  }, []);

  if (!rows) return <View style={styles.center}><ActivityIndicator /></View>;

  const queue = async (r: Row) => {
    await setDecision(r.asset.id, 'delete', r.size, monthKeyOf(r.asset.creationTime));
    setQueued((q) => new Set(q).add(r.asset.id));
  };
  const keep = async (r: Row) => {
    await setDecision(r.asset.id, 'keep', r.size, monthKeyOf(r.asset.creationTime));
    setRows((rs) => rs && rs.filter((x) => x.asset.id !== r.asset.id));
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.asset.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={<Text style={{ color: t.sub, textAlign: 'center' }}>No videos left to review.</Text>}
        renderItem={({ item }) => {
          const isQ = queued.has(item.asset.id);
          return (
            <View style={[styles.row, { backgroundColor: t.card }]}>
              <Pressable
                onPress={() => setOpen(item)} accessibilityRole="button" accessibilityLabel="Play video"
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}
              >
                <View>
                  <Image source={{ uri: item.asset.uri }} style={styles.thumb} contentFit="cover" />
                  <View style={styles.play}><Text style={{ color: '#fff', fontSize: 16 }}>▶</Text></View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: '700' }}>{formatBytes(item.size)}</Text>
                  <Text style={{ color: t.sub, fontSize: 12 }}>
                    {Math.round(item.asset.duration)}s · {new Date(item.asset.creationTime).toLocaleDateString()}
                  </Text>
                  <Text style={{ color: t.accent, fontSize: 12, fontWeight: '600' }}>Tap to watch</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => keep(item)}><Text style={{ color: t.keep, fontWeight: '700' }}>Keep</Text></Pressable>
              <Pressable onPress={() => queue(item)} disabled={isQ}>
                <Text style={{ color: t.del, fontWeight: '700', opacity: isQ ? 0.4 : 1 }}>{isQ ? 'Queued' : 'Delete'}</Text>
              </Pressable>
            </View>
          );
        }}
      />
      <MediaViewer
        id={open?.asset.id ?? null}
        onClose={() => setOpen(null)}
        actions={open ? [
          { label: 'Keep', icon: 'checkmark', color: t.keep, onPress: () => void keep(open) },
          ...(queued.has(open.asset.id) ? [] : [{ label: 'Delete', icon: 'trash.fill' as const, color: t.del, onPress: () => void queue(open) }]),
        ] : []}
      />
      <Pressable onPress={() => router.push('/review')} style={[styles.cta, { backgroundColor: t.accent }]}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>Review deletions</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 18 },
  thumb: { width: 64, height: 64, borderRadius: 12 },
  play: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 12 },
  cta: { margin: 16, padding: 16, borderRadius: 16, alignItems: 'center' },
});
