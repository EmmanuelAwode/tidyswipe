import { Tabs } from 'expo-router/js-tabs';
import React from 'react';
import { Icon } from '../../components/ui';
import { useTheme } from '../../theme/theme';

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.sub,
        tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Clean', tabBarIcon: ({ color }) => <Icon name="sparkles" color={color} /> }} />
      <Tabs.Screen name="months" options={{ title: 'Months', tabBarIcon: ({ color }) => <Icon name="calendar" color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ color }) => <Icon name="square.grid.2x2.fill" color={color} /> }} />
    </Tabs>
  );
}
