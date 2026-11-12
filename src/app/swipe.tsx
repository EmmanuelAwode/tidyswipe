import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { SharedValue, interpolate, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SwipeCard, SwipeCardHandle } from '../components/SwipeCard';
import { collectionTitle, formatBytes, getInfo } from '../services/photos';
import { useDeck } from '../services/useDeck';
import { useTheme } from '../theme/theme';

export default function SwipeScreen() {
  const t = useTheme();
  const { key } = useLocalSearchParams<{ key: string }>();
  const deck = useDeck(key ?? 'recents');
  const top = useRef<SwipeCardHandle>(null);
  const progress = useSharedValue(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [details, setDetails] = useState<string | null>(null);

  const current = deck.queue[0];

  const showDetails = async () => {
    if (!current) return;
    try {
      const i = await getInfo(current.id);
      setDetails([
        i.filename,
        `${i.width} × ${i.height}`,
        new Date(i.creationTime).toLocaleString(),
        i.mediaType === 'video' ? `Duration ${Math.round(i.duration)}s` : '',
        i.location ? `Location ${i.location.latitude.toFixed(3)}, ${i.location.longitude.toFixed(3)}` : '',
        i.isNetworkAsset ? 'Stored in iCloud' : '',
      ].filter(Boolean).join('\n'));
    } catch {
      setDetails('Details unavailable (the item may be in iCloud or was deleted).');
    }
  };

  if (deck.loading) return <View style={[styles.center, { backgroundColor: t.bg }]}><ActivityIndicator /></View>;

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: collectionTitle(key ?? '') }} />
      <Text style={[styles.counter, { color: t.sub }]}>
        {deck.remaining !== null ? `${deck.remaining.toLocaleString()} left` : `${deck.queue.length}+ in queue`}
      </Text>

      <View style={styles.deck}>
        {!current ? (
          <View style={styles.center}>
            <Text style={[styles.done, { color: t.text }]}>{deck.exhausted ? 'All caught up 🎉' : 'Loading…'}</Text>
            <Pressable onPress={() => router.replace('/review')} style={[styles.cta, { backgroundColor: t.accent }]}>
              <Text style={styles.ctaText}>Review deletions</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {deck.queue[2] && <Behind uri={deck.queue[2].uri} scale={0.9} dy={28} to={{ scale: 0.95, dy: 14 }} progress={progress} />}
            {deck.queue[1] && <Behind uri={deck.queue[1].uri} scale={0.95} dy={14} to={{ scale: 1, dy: 0 }} progress={progress} />}
            <SwipeCard
              key={current.id}
              asset={current}
              handleRef={top}
              progress={progress}
              onSwiped={(d) => deck.decide(d === 'right' ? 'keep' : 'delete')}
            />
          </>
        )}
      </View>

      <View style={styles.controls}>
        <Round label="↩" color={t.sub} disabled={!deck.canUndo} onPress={deck.undo} t={t} />
        <Round label="✕" color={t.del} disabled={!current} onPress={() => top.current?.fling('left')} t={t} big />
        <Round label={current && deck.bookmarks.has(current.id) ? '★' : '☆'} color="#F5A524" disabled={!current} onPress={deck.bookmark} t={t} />
        <Round label="✓" color={t.keep} disabled={!current} onPress={() => top.current?.fling('right')} t={t} big />
        <Round label="ⓘ" color={t.sub} disabled={!current} onPress={showDetails} t={t} />
      </View>
      <View style={styles.footer}>
        <Pressable onPress={() => setFullscreen(true)} disabled={!current}><Text style={{ color: t.accent }}>Fullscreen</Text></Pressable>
        <Pressable onPress={() => router.push('/review')}><Text style={{ color: t.accent }}>Review deletions</Text></Pressable>
      </View>

      <Modal visible={fullscreen} animationType="fade" onRequestClose={() => setFullscreen(false)}>
        <Pressable style={styles.full} onPress={() => setFullscreen(false)}>
          {current && <Image source={{ uri: current.uri }} style={StyleSheet.absoluteFill} contentFit="contain" />}
          <Text style={styles.fullHint}>Tap to close</Text>
        </Pressable>
      </Modal>
      <Modal visible={!!details} transparent animationType="fade" onRequestClose={() => setDetails(null)}>
        <Pressable style={styles.scrim} onPress={() => setDetails(null)}>
          <View style={[styles.sheet, { backgroundColor: t.card }]}>
            <Text style={{ color: t.text, lineHeight: 22 }}>{details}</Text>
            {current && <Text style={{ color: t.sub, marginTop: 8 }}>
              ~{formatBytes(current.mediaType === 'video' ? current.duration * 2.5e6 : current.width * current.height * 0.35)} (estimate)
            </Text>}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Behind({ uri, scale, dy, to, progress }: {
  uri: string; scale: number; dy: number; to: { scale: number; dy: number }; progress: SharedValue<number>;
}) {
  // As the top card is dragged away, the cards underneath rise to the next slot.
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [dy, to.dy]) },
      { scale: interpolate(progress.value, [0, 1], [scale, to.scale]) },
    ],
  }));
  return (
    <Animated.View style={[styles.behind, style]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
    </Animated.View>
  );
}

function Round({ label, color, onPress, disabled, big, t }: {
  label: string; color: string; onPress: () => void; disabled?: boolean; big?: boolean; t: ReturnType<typeof useTheme>;
}) {
  const s = big ? 64 : 48;
  return (
    <Pressable
      onPress={onPress} disabled={disabled}
      style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}
    >
      <Text style={{ fontSize: big ? 28 : 20, color, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  counter: { textAlign: 'center', fontWeight: '600', marginTop: 4 },
  deck: { flex: 1, marginHorizontal: 20, marginVertical: 16 },
  behind: { ...StyleSheet.absoluteFill, borderRadius: 28, overflow: 'hidden', opacity: 0.9 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', paddingHorizontal: 12 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 14 },
  done: { fontSize: 22, fontWeight: '800' },
  cta: { paddingHorizontal: 22, paddingVertical: 14, borderRadius: 16 },
  ctaText: { color: '#fff', fontWeight: '700' },
  full: { flex: 1, backgroundColor: '#000' },
  fullHint: { position: 'absolute', bottom: 50, alignSelf: 'center', color: '#fff9' },
  scrim: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { margin: 12, padding: 20, borderRadius: 24 },
});
