import { useEventListener } from 'expo';
import type { VideoPlayer } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDuration } from './SwipeCard';
import { Icon } from './ui';

/** Play/pause, a tap-or-drag seek bar, elapsed/remaining time and a mute toggle. */
export function VideoBar({ player, color, sub }: { player: VideoPlayer; color: string; sub: string }) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const width = useRef(1);

  useEffect(() => {
    try {
      player.timeUpdateEventInterval = 0.25;
      setMuted(player.muted);
      setPlaying(player.playing);
      setDuration(player.duration || 0);
    } catch {
      // player was released while the card changed
    }
  }, [player]);

  useEventListener(player, 'timeUpdate', (e) => {
    setTime(e.currentTime);
    try {
      if (player.duration && player.duration !== duration) setDuration(player.duration);
    } catch {
      // released
    }
  });
  useEventListener(player, 'playingChange', (e) => setPlaying(e.isPlaying));
  useEventListener(player, 'mutedChange', (e) => setMuted(e.muted));

  const seek = (e: GestureResponderEvent) => {
    if (!duration) return;
    const frac = Math.max(0, Math.min(1, e.nativeEvent.locationX / width.current));
    try {
      player.currentTime = frac * duration;
      setTime(frac * duration);
    } catch {
      // released
    }
  };
  const safe = (fn: () => void) => () => {
    try {
      fn();
    } catch {
      // released
    }
  };

  const frac = duration ? Math.min(1, time / duration) : 0;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable hitSlop={12} onPress={safe(() => (player.playing ? player.pause() : player.play()))}>
          <View style={styles.icon}><Icon name={playing ? 'pause.fill' : 'play.fill'} size={20} color={color} /></View>
        </Pressable>
        <View
          style={styles.hit}
          onLayout={(e) => { width.current = e.nativeEvent.layout.width || 1; }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={seek}
          onResponderMove={seek}
        >
          <View style={[styles.track, { backgroundColor: sub + '55' }]} pointerEvents="none">
            <View style={{ width: `${frac * 100}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
          </View>
        </View>
        <Pressable hitSlop={12} onPress={safe(() => { player.muted = !player.muted; })}>
          <View style={styles.icon}><Icon name={muted ? 'speaker.slash.fill' : 'speaker.wave.2.fill'} size={20} color={color} /></View>
        </Pressable>
      </View>
      <View style={styles.times}>
        <Text style={{ color: sub, fontSize: 12 }}>{formatDuration(time)}</Text>
        <Text style={{ color: sub, fontSize: 12 }}>-{formatDuration(Math.max(0, duration - time))}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 24, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  hit: { flex: 1, height: 32, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  times: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 42 },
});
