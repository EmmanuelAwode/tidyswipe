import { Image } from 'expo-image';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { VideoPlayer, VideoView, useVideoPlayer } from 'expo-video';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn, FadeInDown, SharedValue, interpolate, useAnimatedStyle, useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SwipeCard, SwipeCardHandle, formatDuration } from '../components/SwipeCard';
import { VideoBar } from '../components/VideoBar';
import { Button, Icon, Tap } from '../components/ui';
import { getPending } from '../db/database';
import { collectionTitle, estimateSize, formatBytes, getInfo, videoUriOf } from '../services/photos';
import { useDeck } from '../services/useDeck';
import { Theme, useTheme } from '../theme/theme';

export default function SwipeScreen() {
  // `n` changes for each new batch, forcing a fresh deck and counters.
  const { n } = useLocalSearchParams<{ n?: string }>();
  return <SwipeInner key={n ?? 'first'} />;
}

function SwipeInner() {
  const t = useTheme();
  const { key, limit } = useLocalSearchParams<{ key: string; limit?: string; n?: string }>();
  const batch = limit ? Number(limit) : undefined;
  const deck = useDeck(key ?? 'recents', batch);
  const top = useRef<SwipeCardHandle>(null);
  const progress = useSharedValue(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [details, setDetails] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [cardPlayer, setCardPlayer] = useState<VideoPlayer | null>(null);
  const reviewing = useRef(false);

  const current = deck.finished ? undefined : deck.queue[0];
  const ended = deck.finished || (!current && deck.exhausted);

  const nextBatch = useCallback(
    () => router.replace({ pathname: '/swipe', params: { key, limit, n: String(Date.now()) } }),
    [key, limit],
  );
  const openReview = () => {
    reviewing.current = true;
    router.push('/review');
  };

  // Coming back from the review screen with nothing left to delete means the
  // batch is fully dealt with: go straight to the next one instead of the summary.
  useFocusEffect(
    useCallback(() => {
      if (!reviewing.current) return;
      reviewing.current = false;
      if (!deck.finished) return;
      void getPending().then((rows) => {
        if (rows.length === 0) nextBatch();
      });
    }, [deck.finished, nextBatch]),
  );

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

  const position = batch ? Math.min(deck.done + (current ? 1 : 0), batch) : 0;
  const isVideo = current?.mediaType === 'video';

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: collectionTitle(key ?? ''),
          headerRight: () =>
            deck.session.del > 0 && !ended ? (
              <Tap onPress={openReview} label="Review deletions" style={[styles.trashChip, { backgroundColor: t.del + '26' }]}>
                <Icon name="trash.fill" size={14} color={t.del} />
                <Text style={{ color: t.del, fontWeight: '700' }}>{deck.session.del}</Text>
              </Tap>
            ) : null,
        }}
      />

      {deck.loading ? (
        <View style={styles.center}><ActivityIndicator /></View>
      ) : ended ? (
        <Summary t={t} batch={batch} kept={deck.session.keep} del={deck.session.del} onReview={openReview} onNext={deck.finished ? nextBatch : undefined} />
      ) : (
        <>
          {/* Status: where am I, how old is this item */}
          <View style={styles.status}>
            <Text style={[styles.age, { color: t.text }]}>{current ? ageLabel(current.creationTime) : ' '}</Text>
            <Text style={[styles.counter, { color: t.sub }]}>
              {[
                batch ? `${position} of ${batch}`
                  : deck.remaining !== null ? `${deck.remaining.toLocaleString()} left`
                  : key === 'similar' ? 'Taken seconds apart'
                  : deck.total ? `${deck.total.toLocaleString()} in this collection` : '',
                isVideo && current ? `${formatDuration(current.duration)} · ~${formatBytes(estimateSize(current))}` : '',
              ].filter(Boolean).join('  ·  ') || ' '}
            </Text>
            {batch ? (
              <View style={[styles.track, { backgroundColor: t.track }]}>
                <View style={{ width: `${(deck.done / batch) * 100}%`, height: '100%', backgroundColor: t.accent, borderRadius: 2 }} />
              </View>
            ) : null}
          </View>

          <View style={styles.deck}>
            {!current ? (
              <View style={styles.center}><ActivityIndicator /></View>
            ) : (
              <>
                {deck.queue[2] && !(batch && deck.done >= batch - 2) && <Behind uri={deck.queue[2].uri} scale={0.9} dy={24} to={{ scale: 0.95, dy: 12 }} progress={progress} />}
                {deck.queue[1] && !(batch && deck.done >= batch - 1) && <Behind uri={deck.queue[1].uri} scale={0.95} dy={12} to={{ scale: 1, dy: 0 }} progress={progress} />}
                <SwipeCard
                  key={current.id}
                  asset={current}
                  handleRef={top}
                  progress={progress}
                  onPlayer={setCardPlayer}
                  onSwiped={(d) => deck.decide(d === 'right' ? 'keep' : 'delete')}
                />
                {/* Secondary actions sit on the media, out of the way of the main choice */}
                <View style={styles.overlay} pointerEvents="box-none">
                  <Tap onPress={showDetails} label="Details" style={styles.glass}>
                    <Icon name="info" size={16} color="#fff" />
                  </Tap>
                  <Tap
                    onPress={() => (isVideo ? setVideoUri(videoUriOf(current)) : setFullscreen(true))}
                    label="Fullscreen"
                    style={styles.glass}
                  >
                    <Icon name="arrow.up.left.and.arrow.down.right" size={15} color="#fff" />
                  </Tap>
                </View>
              </>
            )}
          </View>

          {isVideo && cardPlayer ? <VideoBar player={cardPlayer} color={t.text} sub={t.sub} /> : null}

          {/* Primary choice: two large, labelled, colour-coded targets */}
          <View style={styles.actions}>
            <Tap onPress={deck.undo} disabled={!deck.canUndo} label="Undo" style={[styles.small, { backgroundColor: t.card }]}>
              <Icon name="arrow.uturn.backward" size={20} color={t.text} />
            </Tap>
            <View style={styles.primary}>
              <Tap onPress={() => top.current?.fling('left')} disabled={!current} label="Delete" style={[styles.big, { backgroundColor: t.del + '24' }]}>
                <Icon name="xmark" size={30} color={t.del} />
              </Tap>
              <Text style={[styles.caption, { color: t.del }]}>Delete</Text>
            </View>
            <View style={styles.primary}>
              <Tap onPress={() => top.current?.fling('right')} disabled={!current} label="Keep" style={[styles.big, { backgroundColor: t.keep + '24' }]}>
                <Icon name="checkmark" size={30} color={t.keep} />
              </Tap>
              <Text style={[styles.caption, { color: t.keep }]}>Keep</Text>
            </View>
            <Tap onPress={deck.bookmark} disabled={!current} label="Bookmark" style={[styles.small, { backgroundColor: t.card }]}>
              <Icon
                name={current && deck.bookmarks.has(current.id) ? 'bookmark.fill' : 'bookmark'}
                size={20}
                color={current && deck.bookmarks.has(current.id) ? '#F5A524' : t.text}
              />
            </Tap>
          </View>
        </>
      )}

      <Modal visible={!!videoUri} animationType="fade" onRequestClose={() => setVideoUri(null)}>
        {videoUri && <VideoModal uri={videoUri} onClose={() => setVideoUri(null)} />}
      </Modal>
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
            {current && (
              <Text style={{ color: t.sub, marginTop: 8 }}>
                ~{formatBytes(current.mediaType === 'video' ? current.duration * 2.5e6 : current.width * current.height * 0.35)} (estimate)
              </Text>
            )}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Summary({ t, batch, kept, del, onReview, onNext }: {
  t: Theme; batch?: number; kept: number; del: number; onReview: () => void; onNext?: () => void;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(280)} style={styles.summary}>
      <Animated.View entering={FadeIn.delay(120)} style={[styles.badge, { backgroundColor: t.keep + '24' }]}>
        <Icon name="checkmark" size={34} color={t.keep} />
      </Animated.View>
      <Text style={[styles.title, { color: t.text }]}>{onNext ? 'Batch done' : 'All caught up'}</Text>

      <View style={styles.stats}>
        <View style={[styles.stat, { backgroundColor: t.card }]}>
          <Text style={[styles.statNum, { color: t.keep }]}>{kept}</Text>
          <Text style={{ color: t.sub }}>kept</Text>
        </View>
        <View style={[styles.stat, { backgroundColor: t.card }]}>
          <Text style={[styles.statNum, { color: t.del }]}>{del}</Text>
          <Text style={{ color: t.sub }}>to delete</Text>
        </View>
      </View>

      <View style={styles.summaryActions}>
        {del > 0 && <Button title={`Review and delete ${del}`} icon="trash.fill" color={t.del} onPress={onReview} />}
        {onNext && (
          <Button
            title={del > 0 ? `Skip, next ${batch}` : `Next ${batch}`}
            color={del > 0 ? t.card : t.accent}
            textColor={del > 0 ? t.text : '#fff'}
            onPress={onNext}
          />
        )}
        <Tap onPress={() => router.back()} style={{ padding: 10, alignSelf: 'center' }}>
          <Text style={{ color: t.sub, fontWeight: '600' }}>Back to home</Text>
        </Tap>
      </View>
    </Animated.View>
  );
}

/** "Today", "3 days ago", "2 months ago", "1 year ago" */
function ageLabel(t: number): string {
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days < 1) return 'Today';
  if (days < 2) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) {
    const m = Math.floor(days / 30);
    return `${m} month${m > 1 ? 's' : ''} ago`;
  }
  const y = Math.floor(days / 365);
  return `${y} year${y > 1 ? 's' : ''} ago`;
}

function VideoModal({ uri, onClose }: { uri: string; onClose: () => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <VideoView player={player} style={{ flex: 1 }} nativeControls contentFit="contain" />
      <Tap onPress={onClose} label="Close" style={[styles.glass, styles.closeBtn]}>
        <Icon name="xmark" size={16} color="#fff" />
      </Tap>
    </View>
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

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  trashChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },

  status: { alignItems: 'center', gap: 2, paddingTop: 2 },
  age: { fontSize: 20, fontWeight: '700' },
  counter: { fontSize: 13, fontWeight: '500' },
  track: { width: 120, height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 6 },

  deck: { flex: 1, marginHorizontal: 20, marginTop: 14, marginBottom: 22 },
  behind: { ...StyleSheet.absoluteFill, borderRadius: 28, overflow: 'hidden', opacity: 0.85 },
  overlay: { position: 'absolute', top: 12, right: 12, gap: 10 },
  glass: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },

  actions: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 22, paddingTop: 4, paddingBottom: 6 },
  primary: { alignItems: 'center', gap: 6 },
  big: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  small: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  caption: { fontSize: 12, fontWeight: '700' },

  summary: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 18 },
  badge: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '800' },
  stats: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
  stat: { flex: 1, borderRadius: 20, paddingVertical: 18, alignItems: 'center', gap: 2 },
  statNum: { fontSize: 32, fontWeight: '800' },
  summaryActions: { alignSelf: 'stretch', gap: 10, marginTop: 8 },

  closeBtn: { position: 'absolute', top: 60, right: 20 },
  full: { flex: 1, backgroundColor: '#000' },
  fullHint: { position: 'absolute', bottom: 50, alignSelf: 'center', color: '#fff9' },
  scrim: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { margin: 12, padding: 20, borderRadius: 24 },
});
