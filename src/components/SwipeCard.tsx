import { Image } from 'expo-image';
import { useEventListener } from 'expo';
import { VideoPlayer, VideoView, useVideoPlayer } from 'expo-video';
import React, { useEffect, useImperativeHandle } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  SharedValue,
  useAnimatedReaction,
  withSpring,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { PhotoAsset } from '../services/photos';
import { videoUriOf } from '../services/photos';

export type Dir = 'left' | 'right';
export type SwipeCardHandle = { fling(dir: Dir): void };

type Props = {
  asset: PhotoAsset;
  onSwiped: (dir: Dir) => void;
  handleRef?: React.Ref<SwipeCardHandle>;
  onTap?: () => void;
  /** Mirrors |translateX| / threshold (0..1) so cards behind can animate forward. */
  progress?: SharedValue<number>;
  /** Receives the card's video player (or null) so the screen can show seek controls. */
  onPlayer?: (p: VideoPlayer | null) => void;
};

const THRESHOLD = 110;

export function SwipeCard({ asset, onSwiped, handleRef, onTap, progress, onPlayer }: Props) {
  const { width } = useWindowDimensions();
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  const finish = (dir: Dir) => onSwiped(dir);

  const flingTo = (dir: Dir) => {
    'worklet';
    const target = (dir === 'right' ? 1 : -1) * width * 1.4;
    tx.value = withTiming(target, { duration: 220, easing: Easing.out(Easing.quad) }, (done) => {
      if (done) scheduleOnRN(finish, dir);
    });
  };

  useImperativeHandle(handleRef, () => ({ fling: (d) => flingTo(d) }));

  const pan = usePanGesture({
    activeOffsetX: [-12, 12],
    onUpdate: (e) => {
      'worklet';
      tx.value = e.translationX;
      ty.value = e.translationY * 0.3;
    },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationX > THRESHOLD || e.velocityX > 900) flingTo('right');
      else if (e.translationX < -THRESHOLD || e.velocityX < -900) flingTo('left');
      else {
        tx.value = withSpring(0, { damping: 16, stiffness: 180 });
        ty.value = withSpring(0, { damping: 16, stiffness: 180 });
      }
    },
  });

  useAnimatedReaction(
    () => Math.min(1, Math.abs(tx.value) / THRESHOLD),
    (p) => { if (progress) progress.value = p; },
  );

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${interpolate(tx.value, [-width, 0, width], [-14, 0, 14])}deg` },
    ],
  }));
  const keepStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [20, THRESHOLD], [0, 1], 'clamp'),
  }));
  const delStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [-THRESHOLD, -20], [1, 0], 'clamp'),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, cardStyle]} onTouchEnd={undefined}>
        <Image
          source={{ uri: asset.uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          recyclingKey={asset.id}
          transition={120}
        />
        {asset.mediaType === 'video' && <InlinePlayer uri={videoUriOf(asset)} onPlayer={onPlayer} />}
        {asset.mediaType === 'video' && (
          <View style={styles.badge} pointerEvents="none">
            <Text style={styles.badgeText}>▶ {formatDuration(asset.duration)}</Text>
          </View>
        )}
        <Animated.View style={[styles.stamp, styles.keepStamp, keepStyle]}>
          <Text style={[styles.stampText, { color: '#22C55E' }]}>KEEP</Text>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.delStamp, delStyle]}>
          <Text style={[styles.stampText, { color: '#EF4444' }]}>DELETE</Text>
        </Animated.View>
        {onTap ? <View style={StyleSheet.absoluteFill} pointerEvents="none" /> : null}
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * Autoplays the video with sound (looping) on the top card. On iOS it uses the PhotoKit URI
 * (ph://) directly: expo-video asks PhotoKit for a playable asset, which is the
 * only way iOS grants read access. Plain file:// paths into the library are denied.
 */
function InlinePlayer({ uri, onPlayer }: { uri: string; onPlayer?: (p: VideoPlayer | null) => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = false;
    p.loop = true;
    p.play();
  });
  useEffect(() => {
    onPlayer?.(player);
    return () => onPlayer?.(null);
  }, [player, onPlayer]);
  useEventListener(player, 'statusChange', ({ status, error }) => {
    if (error) console.log(`[video] ${status} - ${error.message}`);
  });
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
      allowsPictureInPicture={false}
      pointerEvents="none"
    />
  );
}

export function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  card: {
    ...StyleSheet.absoluteFill,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#222',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  badge: {
    position: 'absolute', bottom: 16, left: 16, backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  },
  badgeText: { color: '#fff', fontWeight: '600' },
  stamp: {
    position: 'absolute', top: 40, paddingHorizontal: 14, paddingVertical: 6,
    borderWidth: 4, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.25)',
  },
  keepStamp: { left: 24, borderColor: '#22C55E', transform: [{ rotate: '-12deg' }] },
  delStamp: { right: 24, borderColor: '#EF4444', transform: [{ rotate: '12deg' }] },
  stampText: { fontSize: 32, fontWeight: '900', letterSpacing: 2 },
});
