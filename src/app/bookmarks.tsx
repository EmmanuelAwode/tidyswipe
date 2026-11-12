import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text } from 'react-native';
import { getBookmarkList, toggleBookmark } from '../db/database';
import { useTheme } from '../theme/theme';

export default function Bookmarks() {
  const t = useTheme();
  const [ids, setIds] = useState<string[]>([]);
  const load = useCallback(() => { void getBookmarkList().then(setIds); }, []);
  useFocusEffect(load);

  return (
    <FlatList
      data={ids}
      numColumns={3}
      keyExtractor={(i) => i}
      contentContainerStyle={{ padding: 8 }}
      ListEmptyComponent={<Text style={{ color: t.sub, textAlign: 'center', marginTop: 40 }}>Star photos while swiping to collect them here.</Text>}
      renderItem={({ item }) => (
        <Pressable
          style={styles.cell}
          onPress={() => Alert.alert('Remove bookmark?', undefined, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', onPress: async () => { await toggleBookmark(item); load(); } },
          ])}
        >
          <Image source={{ uri: `ph://${item}` }} style={styles.thumb} contentFit="cover" recyclingKey={item} />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  cell: { width: '33.33%', aspectRatio: 1, padding: 3 },
  thumb: { flex: 1, borderRadius: 10 },
});
