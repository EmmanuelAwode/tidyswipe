import React, { useState } from 'react';
import { ActivityIndicator, StyleProp, ViewStyle } from 'react-native';
import { shareAsset } from '../services/share';
import { Icon, Tap } from './ui';

/** Share the given library item. Shows a spinner while a large video is being prepared. */
export function ShareButton({ id, style, color = '#fff', size = 16 }: {
  id: string; style?: StyleProp<ViewStyle>; color?: string; size?: number;
}) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await shareAsset(id);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Tap onPress={go} label="Share" hitSlop={12} style={style}>
      {busy ? <ActivityIndicator size="small" color={color} /> : <Icon name="square.and.arrow.up" size={size} color={color} />}
    </Tap>
  );
}
