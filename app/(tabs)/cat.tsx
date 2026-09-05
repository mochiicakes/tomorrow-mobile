import React, { useState, useEffect } from 'react';
import { View, Pressable, ScrollView, Switch, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Screen, Title, Muted, Card, AccentButton } from '../../src/ui';
import { Cat } from '../../src/Cat';
import { useStore } from '../../src/store';
import { SKINS, buildTheme, useTheme, space, radius } from '../../src/theme';
import { formatTime } from '../../src/dates';
import { Text } from '../../src/Txt';
import { collectDiagnostics, type Diagnostics } from '../../src/diagnostics';

export default function CatScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, forcePrompt } = useStore();
  const [showPicker, setShowPicker] = useState(Platform.OS === 'ios');
  const [diag, setDiag] = useState<Diagnostics | null>(null);

  useEffect(() => {
    collectDiagnostics().then(setDiag);
  }, [settings.hour, settings.minute, settings.notificationsOn]);

  const timeValue = (() => {
    const d = new Date();
    d.setHours(settings.hour, settings.minute, 0, 0);
    return d;
  })();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{
        paddingTop: insets.top + space(1),
        paddingHorizontal: space(2),
        paddingBottom: space(6),
        gap: space(2),
      }}>
        <Title>Your cat</Title>

        {/* portrait */}
        <View style={{ alignItems: 'center', paddingVertical: space(2) }}>
          <Cat size={190} coat={t.coat} eye={t.accent} />
          <Text style={{ color: t.accent, fontWeight: '700', fontSize: 18, marginTop: space(1) }}>
            {SKINS.find(s => s.id === settings.skin)?.label}
          </Text>
        </View>

        {/* skins */}
        <Card style={{ gap: space(1.5) }}>
          <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>Coat</Text>
          <Muted>Each cat sets the whole app's colours.</Muted>
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            {SKINS.map(s => {
              const active = s.id === settings.skin;
              const preview = buildTheme(s.id);
              return (
                <Pressable
                  key={s.id}
                  onPress={() => updateSettings({ skin: s.id })}
                  style={{ alignItems: 'center', gap: 6, width: 68 }}
                >
                  <View style={{
                    width: 64, height: 64, borderRadius: 32,
                    backgroundColor: preview.bg,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: active ? 3 : 1,
                    borderColor: active ? t.accent : t.hairline,
                  }}>
                    <Cat size={46} coat={preview.coat} eye={preview.accent} />
                  </View>
                  <Text style={{ fontSize: 11, color: active ? t.text : t.muted }}>{s.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* nudge */}
        <Card style={{ gap: space(1.5) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>Daily nudge</Text>
            <Switch
              value={settings.notificationsOn}
              onValueChange={v => updateSettings({ notificationsOn: v })}
              trackColor={{ true: t.accent, false: t.hairline }}
              thumbColor={t.surface}
            />
          </View>
          <Muted>The cat asks about tomorrow at this time, every day.</Muted>

          <Pressable
            onPress={() => setShowPicker(s => (Platform.OS === 'ios' ? s : !s))}
            style={{
              backgroundColor: t.raised, borderRadius: radius.md,
              padding: space(2), alignItems: 'center',
            }}
          >
            <Text style={{ color: t.accent, fontSize: 28, fontWeight: '700' }}>
              {formatTime(settings.hour, settings.minute)}
            </Text>
            {Platform.OS !== 'ios' && <Muted>Tap to change</Muted>}
          </Pressable>

          {showPicker && (
            <DateTimePicker
              value={timeValue}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, date) => {
                if (Platform.OS !== 'ios') setShowPicker(false);
                if (date) updateSettings({ hour: date.getHours(), minute: date.getMinutes() });
              }}
            />
          )}
        </Card>

        <Card style={{ gap: space(1) }}>
          <Text style={{ color: t.text, fontWeight: '700', fontSize: 15 }}>Nudge status</Text>
          {diag ? (
            <>
              <Muted>Environment: {diag.executionEnvironment}</Muted>
              <Muted>Module available: {String(diag.notificationsAvailable)}</Muted>
              <Muted>Permission: {diag.permission}</Muted>
              <Muted>Scheduled: {diag.scheduledCount}</Muted>
              {diag.nextTrigger && <Muted>Trigger: {diag.nextTrigger}</Muted>}
            </>
          ) : (
            <Muted>Checking…</Muted>
          )}
        </Card>

        <AccentButton
          label="Test notification (10s)"
          onPress={async () => {
            const Notifications = require('expo-notifications');
            await Notifications.scheduleNotificationAsync({
              content: { title: 'Test', body: 'If you see this, delivery works.' },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 10 },
            });
          }}
        />

        <AccentButton label="Ask me about tomorrow now" onPress={forcePrompt} />
      </ScrollView>
    </Screen>
  );
}
