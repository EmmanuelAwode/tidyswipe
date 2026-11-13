import { router } from 'expo-router';
import { Alert, Platform } from 'react-native';
import { isRandom } from './photos';

/** Opens a collection. Random collections first ask how many items to review. */
export function openCollection(key: string) {
  if (key === 'videos') return router.push('/videos');
  if (key === 'duplicates') return router.push('/duplicates');
  if (isRandom(key)) {
    const go = (limit: number) =>
      router.push({ pathname: '/swipe', params: { key, limit: String(limit), n: String(Date.now()) } });
    const sizes = Platform.OS === 'android' ? [10, 30, 100] : [10, 30, 50, 100]; // Android shows three buttons at most
    return Alert.alert(
      'How many?',
      'You choose what to delete at the end of the batch.',
      [
        ...sizes.map((n) => ({ text: String(n), onPress: () => go(n) })),
        ...(Platform.OS === 'android' ? [] : [{ text: 'Cancel', style: 'cancel' as const }]),
      ],
      { cancelable: true },
    );
  }
  router.push({ pathname: '/swipe', params: { key } });
}
