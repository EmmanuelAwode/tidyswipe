import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { installCrashGuard } from '../services/crash';
import { useTheme } from '../theme/theme';

installCrashGuard();

export default function RootLayout() {
  const t = useTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style="auto" />
      <ErrorBoundary>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
        <Stack.Screen name="swipe" options={{ title: '' }} />
        <Stack.Screen name="duplicates" options={{ title: 'Duplicates' }} />
        <Stack.Screen name="duplicate" options={{ title: 'Compare' }} />
        <Stack.Screen name="bookmarks" options={{ title: 'Bookmarks' }} />
        <Stack.Screen name="stats" options={{ title: 'Statistics' }} />
        <Stack.Screen name="history" options={{ title: 'Undo History' }} />
        <Stack.Screen name="map" options={{ title: 'Photo Map' }} />
        <Stack.Screen name="review" options={{ title: 'Confirm deletion', presentation: 'modal' }} />
      </Stack>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
