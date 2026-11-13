import { Image } from 'expo-image';
import { SFSymbol } from 'expo-symbols';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PhotoAsset, getInfo, uriForId, videoUriOf } from '../services/photos';
import { ShareButton } from './ShareButton';
import { Icon, Tap } from './ui';

export type ViewerAction = {
  label: string;
  icon?: SFSymbol;
  color?: string;
  onPress: () => void | Promise<void>;
  /** What happens after: 'next' moves on (default), 'removed' means the item leaves the list, 'close' shuts the viewer. */
  then?: 'next' | 'removed' | 'close';
};

/**
 * Viewer opened from any list. Swipe sideways to move through the whole list,
 * like the Photos app. Getting out is always easy: the Done button, a swipe
 * down on iOS (it is a sheet), or the back button on Android. `actions` are the decisions for the item on screen.
 */
export function MediaViewer({ ids, id, onClose, actions }: {
  ids: string[]; id: string | null; onClose: () => void; actions?: (id: string) => ViewerAction[];
}) {
  return (
    <Modal
      visible={!!id}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      {id && <Pager ids={ids} start={id} onClose={onClose} actions={actions} />}
    </Modal>
  );
}

function Pager({ ids, start, onClose, actions }: {
  ids: string[]; start: string; onClose: () => void; actions?: (id: string) => ViewerAction[];
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // An iOS sheet already sits below the status bar; elsewhere clear it ourselves.
  const top = Platform.OS === 'ios' ? 14 : insets.top + 10;
  const list = useRef<FlatList<string>>(null);
  const [first] = useState(() => Math.max(0, ids.indexOf(start)));
  const [index, setIndex] = useState(first);

  // The list can shrink while open (an item was decided on); stay in range, or close when it empties.
  useEffect(() => {
    if (ids.length === 0) onClose();
    else if (index > ids.length - 1) setIndex(ids.length - 1);
  }, [ids.length, index, onClose]);

  const current = ids[Math.min(index, ids.length - 1)];
  if (!current) return <View style={styles.root} />;

  const run = async (a: ViewerAction) => {
    const mode = a.then ?? 'next';
    await a.onPress();
    if (mode === 'close') return onClose();
    if (mode === 'removed') return; // the next item slides into place
    if (index < ids.length - 1) {
      list.current?.scrollToIndex({ index: index + 1, animated: true });
      setIndex(index + 1);
    } else onClose();
  };

  const acts = actions?.(current) ?? [];
  return (
    <View style={styles.root}>
      <FlatList
        ref={list}
        data={ids}
        keyExtractor={(i) => i}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={first}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => <Page id={item} width={width} active={item === current} />}
      />

      <View style={[styles.top, { paddingTop: top }]} pointerEvents="box-none">
        <Tap onPress={onClose} label="Done" hitSlop={16} style={styles.close}>
          <Icon name="xmark" size={15} color="#000" />
          <Text style={styles.closeText}>Done</Text>
        </Tap>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {ids.length > 1 && (
            <View style={styles.count}><Text style={styles.countText}>{index + 1} of {ids.length}</Text></View>
          )}
          <ShareButton key={current} id={current} style={styles.share} size={18} />
        </View>
      </View>

      {acts.length > 0 && (
        // Raised so a video's own controls stay reachable underneath.
        <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]} pointerEvents="box-none">
          {acts.map((a) => (
            <Tap key={a.label} label={a.label} onPress={() => void run(a)} style={[styles.action, { backgroundColor: a.color ?? 'rgba(40,40,40,0.9)' }]}>
              {a.icon && <Icon name={a.icon} size={16} color="#fff" />}
              <Text style={styles.actionText}>{a.label}</Text>
            </Tap>
          ))}
        </View>
      )}
    </View>
  );
}

function Page({ id, width, active }: { id: string; width: number; active: boolean }) {
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
    <View style={{ width, flex: 1 }}>
      {/* The still shows at once and stays under the video while it loads. */}
      <Image source={{ uri: uriForId(id) }} style={StyleSheet.absoluteFill} contentFit="contain" />
      {missing && <View style={styles.fill}><Text style={{ color: '#fff' }}>This item is no longer in your library.</Text></View>}
      {!asset && !missing && <View style={styles.fill}><ActivityIndicator color="#fff" /></View>}
      {/* Only the page on screen plays, so sound never comes from a neighbour. */}
      {asset?.mediaType === 'video' && active && <Video uri={videoUriOf(asset)} />}
    </View>
  );
}

function Video({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={[StyleSheet.absoluteFill, { top: 70, bottom: 120 }]} contentFit="contain" nativeControls />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  fill: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: '#fff' },
  closeText: { color: '#000', fontWeight: '700', fontSize: 16 },
  share: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(60,60,60,0.9)', alignItems: 'center', justifyContent: 'center' },
  count: { height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center' },
  countText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'center', gap: 12, paddingHorizontal: 16 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 50, paddingHorizontal: 24, borderRadius: 25 },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
