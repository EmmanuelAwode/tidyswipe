import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Tap } from '../components/ui';
import { getBookmarkList, toggleBookmark } from '../db/database';
import { PhotoAsset, getInfo, uriForId, videoUriOf } from '../services/photos';
import { useTheme } from '../theme/theme';

export default function Bookmarks() {
  const t = useTheme();
  const [ids, setIds] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => { void getBookmarkList().then(setIds); }, []);
  useFocusEffect(load);

  return (
    <>
      <FlatList
        data={ids}
        numColumns={3}
        keyExtractor={(i) => i}
        contentContainerStyle={{ padding: 8 }}
        ListEmptyComponent={<Text style={{ color: t.sub, textAlign: 'center', marginTop: 40 }}>Bookmark photos while swiping to collect them here.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.cell} onPress={() => setOpen(item)} accessibilityRole="button" accessibilityLabel="View bookmark">
            <Image source={{ uri: uriForId(item) }} style={styles.thumb} contentFit="cover" recyclingKey={item} />
          </Pressable>
        )}
      />
      <Modal visible={!!open} animationType="fade" onRequestClose={() => setOpen(null)}>
        {open && (
          <Viewer
            id={open}
            onClose={() => setOpen(null)}
            onRemove={async () => { await toggleBookmark(open); setOpen(null); load(); }}
          />
        )}
      </Modal>
    </>
  );
}

/** Fullscreen view of one bookmarked photo or video. */
function Viewer({ id, onClose, onRemove }: { id: string; onClose: () => void; onRemove: () => void }) {
  const [asset, setAsset] = useState<PhotoAsset | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    getInfo(id)
      .then((a) => { if (live) (a ? setAsset(a) : setMissing(true)); })
      .catch(() => live && setMissing(true));
    return () => { live = false; };
  }, [id]);

  return (
    <View style={styles.viewer}>
      {missing ? (
        <View style={styles.fill}><Text style={{ color: '#fff' }}>This item is no longer in your library.</Text></View>
      ) : !asset ? (
        <View style={styles.fill}><ActivityIndicator color="#fff" /></View>
      ) : asset.mediaType === 'video' ? (
        <Video uri={videoUriOf(asset)} />
      ) : (
        <Image source={{ uri: uriForId(id) }} style={StyleSheet.absoluteFill} contentFit="contain" />
      )}
      <SafeAreaView style={styles.bar} pointerEvents="box-none">
        <Tap onPress={onClose} label="Close" style={styles.glass}>
          <Icon name="xmark" size={16} color="#fff" />
        </Tap>
        <Tap onPress={onRemove} label="Remove bookmark" style={[styles.glass, styles.pill]}>
          <Icon name="bookmark.fill" size={15} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700' }}>Remove</Text>
        </Tap>
      </SafeAreaView>
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
  cell: { width: '33.33%', aspectRatio: 1, padding: 3 },
  thumb: { flex: 1, borderRadius: 10 },
  viewer: { flex: 1, backgroundColor: '#000' },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  glass: { minWidth: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', gap: 6, paddingHorizontal: 14 },
});
