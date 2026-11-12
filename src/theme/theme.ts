import { useColorScheme } from 'react-native';

const light = {
  bg: '#F2F2F7', card: '#FFFFFF', text: '#111114', sub: '#6C6C72', border: '#E3E3E8',
  accent: '#5B5BF0', keep: '#22C55E', del: '#EF4444', track: '#E6E6EC',
};
const dark: typeof light = {
  bg: '#000000', card: '#1C1C1E', text: '#F5F5F7', sub: '#9A9AA1', border: '#2C2C2E',
  accent: '#7C7CFF', keep: '#30D158', del: '#FF453A', track: '#2C2C2E',
};
export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
