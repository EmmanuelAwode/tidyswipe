import { AndroidSymbol, SymbolView, SFSymbol } from 'expo-symbols';
import React from 'react';
import { ColorValue, Pressable, StyleProp, Text, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

// Material Symbols used on Android in place of each SF Symbol.
const ANDROID: Record<string, AndroidSymbol> = {
  'trash.fill': 'delete', info: 'info', 'arrow.up.left.and.arrow.down.right': 'open_in_full',
  'arrow.uturn.backward': 'undo', xmark: 'close', checkmark: 'check', 'bookmark.fill': 'bookmark',
  bookmark: 'bookmark_border', 'photo.fill': 'photo', 'video.fill': 'videocam', shuffle: 'shuffle',
  'clock.fill': 'schedule', calendar: 'calendar_month', 'camera.viewfinder': 'screenshot',
  'film.fill': 'movie', 'square.on.square': 'content_copy', 'photo.on.rectangle.angled': 'photo_library',
  'exclamationmark.circle.fill': 'error', 'chevron.right': 'chevron_right', 'chart.bar.fill': 'bar_chart',
  'map.fill': 'map', sparkles: 'auto_awesome', 'square.grid.2x2.fill': 'grid_view', 'pause.fill': 'pause',
  'play.fill': 'play_arrow', 'square.and.arrow.up': 'share', 'speaker.slash.fill': 'volume_off', 'speaker.wave.2.fill': 'volume_up',
};

/** Icon: SF Symbols on iOS, the matching Material Symbol on Android. */
export function Icon({ name, size = 22, color }: { name: SFSymbol; size?: number; color: ColorValue }) {
  return (
    <SymbolView
      name={{ ios: name, android: ANDROID[name] ?? 'circle' }}
      size={size} tintColor={color} weight="semibold" resizeMode="scaleAspectFit"
    />
  );
}

const SPRING = { damping: 18, stiffness: 320 };
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that gives immediate physical feedback: it dips on touch and springs back. */
export function Tap({
  onPress, disabled, style, children, hitSlop = 8, label,
}: {
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  hitSlop?: number;
  label?: string;
}) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress}
      onPressIn={() => { s.value = withSpring(0.92, SPRING); }}
      onPressOut={() => { s.value = withSpring(1, SPRING); }}
      style={[style, anim, disabled && { opacity: 0.3 }]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Full-width primary/secondary button. */
export function Button({
  title, onPress, color, textColor = '#fff', icon,
}: { title: string; onPress: () => void; color: string; textColor?: string; icon?: SFSymbol }) {
  return (
    <Tap
      onPress={onPress}
      label={title}
      style={{
        backgroundColor: color, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 20,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch',
      }}
    >
      {icon && <Icon name={icon} size={18} color={textColor} />}
      <Text style={{ color: textColor, fontWeight: '700', fontSize: 16 }}>{title}</Text>
    </Tap>
  );
}
