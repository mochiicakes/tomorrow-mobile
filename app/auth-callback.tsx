import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, Title, Muted, AccentButton } from '../src/ui';
import { useAuth } from '../src/auth';
import { space } from '../src/theme';

// Signing in remounts the navigator (see app/_layout.tsx), which can mount
// this screen again with the same code. Codes are single-use, so remember them.
const used = new Set<string>();

// link - lands here from confirmation and password-reset emails
export default function AuthCallback() {
  const { code, type, error_description } = useLocalSearchParams<{
    code?: string;
    type?: string;
    error_description?: string;
  }>();
  const { completeLink } = useAuth();
  const [failed, setFailed] = useState<string | null>(error_description ?? null);

  useEffect(() => {
    if (!code || error_description) return;
    if (used.has(code)) {
      router.replace('/');
      return;
    }
    used.add(code);
    completeLink(code, type === 'recovery').then(ok => {
      if (ok) router.replace('/');
      else setFailed('This link has expired or was already used.');
    });
  }, [code]);

  return (
    <Screen style={{ justifyContent: 'center', padding: space(3) }}>
      <View style={{ gap: space(2) }}>
        <Title>{failed ? 'Link problem' : 'One moment…'}</Title>
        <Muted>{failed ?? 'Signing you in.'}</Muted>
        {(failed || !code) && (
          <AccentButton label="Back to the app" onPress={() => router.replace('/')} />
        )}
      </View>
    </Screen>
  );
}
