import React, { useEffect } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth';
import { StoreProvider, useStore } from '../src/store';
import { ThemeContext, buildTheme } from '../src/theme';
import { installNotificationHandler, onNudgeTapped } from '../src/notifications';
import { TomorrowPrompt } from '../src/TomorrowPrompt';
import { NewPasswordPrompt } from '../src/NewPasswordPrompt';
import { useFonts, Silkscreen_400Regular, Silkscreen_700Bold } from '@expo-google-fonts/silkscreen';

installNotificationHandler();

// crash screen - plain RN text so it works even if fonts or providers failed
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const t = buildTheme('mono');
  if (__DEV__) console.warn('[tomorrow] crashed', error);
  return (
    <View style={{
      flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center',
      padding: 32, gap: 16,
    }}>
      <RNText style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>
        Something went wrong
      </RNText>
      <RNText style={{ color: t.muted, fontSize: 14, textAlign: 'center' }}>
        Your tasks are saved on this device.
      </RNText>
      <Pressable
        onPress={retry}
        style={{ backgroundColor: t.eye, paddingVertical: 14, paddingHorizontal: 32 }}
      >
        <RNText style={{ color: t.onAccent, fontWeight: '700' }}>Try again</RNText>
      </Pressable>
    </View>
  );
}

// root
function Themed() {
  const { settings, ready, forcePrompt } = useStore();
  const theme = buildTheme(settings.skin);
  const [fontsLoaded, fontError] = useFonts({ Silkscreen_400Regular, Silkscreen_700Bold });

  useEffect(() => onNudgeTapped(forcePrompt), []);

  if (fontError) console.warn('[tomorrow] font load failed', fontError);
  if (!ready || (!fontsLoaded && !fontError)) return null;

  return (
    <ThemeContext.Provider value={theme}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }} />
      <TomorrowPrompt />
      <NewPasswordPrompt />
    </ThemeContext.Provider>
  );
}

// store - remounts on every identity change so one account's in-memory
// tasks can never be pushed under another
function Session() {
  const { ready, userId } = useAuth();
  if (!ready) return null;
  return (
    <StoreProvider key={userId ?? 'guest'}>
      <Themed />
    </StoreProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Session />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
