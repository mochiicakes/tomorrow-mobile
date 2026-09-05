import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from '../src/store';
import { ThemeContext, buildTheme } from '../src/theme';
import { installNotificationHandler } from '../src/notifications';
import { TomorrowPrompt } from '../src/TomorrowPrompt';
import { useFonts, Silkscreen_400Regular, Silkscreen_700Bold } from '@expo-google-fonts/silkscreen';

installNotificationHandler();

// root
function Themed() {
  const { settings, ready } = useStore();
  const theme = buildTheme(settings.skin);
  const [fontsLoaded] = useFonts({ Silkscreen_400Regular, Silkscreen_700Bold });

  if (!ready) return null;

  return (
    <ThemeContext.Provider value={theme}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }} />
      <TomorrowPrompt />
    </ThemeContext.Provider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Themed />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
