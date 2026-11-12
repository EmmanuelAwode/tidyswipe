import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useTheme } from '../theme/theme';

export default function RootLayout() {
  const t = useTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Tidyswipe', headerLargeTitle: true }} />
        <Stack.Screen name="swipe" options={{ title: '' }} />
        <Stack.Screen name="duplicates" options={{ title: 'Duplicates' }} />
        <Stack.Screen name="duplicate" options={{ title: 'Compare' }} />
        <Stack.Screen name="videos" options={{ title: 'Large Videos' }} />
        <Stack.Screen name="bookmarks" options={{ title: 'Bookmarks' }} />
        <Stack.Screen name="stats" options={{ title: 'Statistics' }} />
        <Stack.Screen name="history" options={{ title: 'Undo History' }} />
        <Stack.Screen name="map" options={{ title: 'Photo Map' }} />
        <Stack.Screen name="review" options={{ title: 'Confirm deletion', presentation: 'modal' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
