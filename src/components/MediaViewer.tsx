import { Image } from 'expo-image';
import { SFSymbol } from 'expo-symbols';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PhotoAsset, getInfo, uriForId, videoUriOf } from '../services/photos';
import { Icon, Tap } from './ui';

export type ViewerAction = { label: string; icon?: SFSymbol; color?: string; onPress: () => void };

/**
 * Fullscreen look at one photo or video, opened from any list in the app.
 * `actions` are the decisions available for that item; each one closes the viewer.
 */
export function MediaViewer({ id, onClose, actions = [] }: {
  id: string | null; onClose: () => void; actions?: ViewerAction[];
}) {
  return (
    <Modal visible={!!id} animationType="fade" onRequestClose={onClose}>
      {id && <Body key={id} id={id} onClose={onClose} actions={actions} />}
    </Modal>
  );
}

function Body({ id, onClose, actions }: { id: string; onClose: () => void; actions: ViewerAction[] }) {
  const [asset, setAsset] = useState<PhotoAsset | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    getInfo(id)
      .then((a) => { if (live) (a ? setAsset(a) : setMissing(true)); })
      .catch(() => live && setMissing(true));
    return () => { live = false; };
  }, [id]);

  const isVideo = asset?.mediaType === 'video';
  return (
    <View style={styles.root}>
      {missing ? (
        <View style={styles.fill}><Text style={{ color: '#fff' }}>This item is no longer in your library.</Text></View>
      ) : !asset ? (
        <View style={styles.fill}><ActivityIndicator color="#fff" /></View>
      ) : isVideo ? (
        <Video uri={videoUriOf(asset)} />
      ) : (
        <Image source={{ uri: uriForId(id) }} style={StyleSheet.absoluteFill} contentFit="contain" />
      )}

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <Tap onPress={onClose} label="Close" style={styles.close}>
          <Icon name="xmark" size={16} color="#fff" />
        </Tap>
      </SafeAreaView>

      {actions.length > 0 && !missing && (
        // Sits above the video's own controls so both stay reachable.
        <SafeAreaView edges={['bottom']} style={[styles.bottom, isVideo && { bottom: 76 }]} pointerEvents="box-none">
          {actions.map((a) => (
            <Tap
              key={a.label} label={a.label} style={[styles.action, { backgroundColor: a.color ?? 'rgba(40,40,40,0.9)' }]}
              onPress={() => { onClose(); a.onPress(); }}
            >
              {a.icon && <Icon name={a.icon} size={16} color="#fff" />}
              <Text style={styles.actionText}>{a.label}</Text>
            </Tap>
          ))}
        </SafeAreaView>
      )}
    </View>
  );
}

function Video({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 8, flexDirection: 'row' },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 50, paddingHorizontal: 24, borderRadius: 25 },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
