import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text } from 'react-native';
import { MediaViewer } from '../components/MediaViewer';
import { getBookmarkList, toggleBookmark } from '../db/database';
import { uriForId } from '../services/photos';
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
      <MediaViewer
        id={open}
        onClose={() => setOpen(null)}
        actions={open ? [{ label: 'Remove bookmark', icon: 'bookmark.fill', onPress: async () => { await toggleBookmark(open); load(); } }] : []}
      />
    </>
  );
}

const styles = StyleSheet.create({
  cell: { width: '33.33%', aspectRatio: 1, padding: 3 },
  thumb: { flex: 1, borderRadius: 10 },
});
