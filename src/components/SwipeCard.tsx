import { Image } from 'expo-image';
import { VideoPlayer, VideoView } from 'expo-video';
import React, { useImperativeHandle } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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

export type Dir = 'left' | 'right';
export type SwipeCardHandle = { fling(dir: Dir): void };

type Props = {
  asset: PhotoAsset;
  onSwiped: (dir: Dir) => void;
  handleRef?: React.Ref<SwipeCardHandle>;
  onTap?: () => void;
  /** Mirrors |translateX| / threshold (0..1) so cards behind can animate forward. */
  progress?: SharedValue<number>;
  /** The screen's single reusable video player; it only draws once it has loaded this card's video. */
  player?: VideoPlayer | null;
  videoReady?: boolean;
};

const THRESHOLD = 110;

export function SwipeCard({ asset, onSwiped, handleRef, onTap, progress, player, videoReady }: Props) {
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
        {asset.mediaType === 'video' && player && videoReady && (
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
            allowsPictureInPicture={false}
            pointerEvents="none"
          />
        )}
        {asset.mediaType === 'video' && !videoReady && (
          <View style={styles.loading} pointerEvents="none">
            <ActivityIndicator color="#fff" />
          </View>
        )}
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
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
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
