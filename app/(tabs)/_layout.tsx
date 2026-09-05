import React from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';
import { PixelIcon, ICONS } from '../../src/PixelIcon';

export default function TabsLayout() {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: t.surface,
          borderTopWidth: 2,
          borderTopColor: t.hairline,
          height: 56 + insets.bottom,
          paddingTop: 10,
          paddingBottom: insets.bottom,
        },
      }}
    >
      <Tabs.Screen name="index" options={{
        tabBarIcon: ({ focused }) => (
          <PixelIcon grid={ICONS.tomorrow} color={focused ? t.eye : t.muted} />
        ),
      }} />
      <Tabs.Screen name="today" options={{
        tabBarIcon: ({ focused }) => (
          <PixelIcon grid={ICONS.today} color={focused ? t.eye : t.muted} />
        ),
      }} />
      <Tabs.Screen name="later" options={{
        tabBarIcon: ({ focused }) => (
          <PixelIcon grid={ICONS.later} color={focused ? t.eye : t.muted} />
        ),
      }} />
      <Tabs.Screen name="cat" options={{
        tabBarIcon: ({ focused }) => (
          <PixelIcon grid={ICONS.cat} color={focused ? t.eye : t.muted} />
        ),
      }} />
    </Tabs>
  );
}