import React, { useState, useEffect } from 'react';
import { View, Pressable, ScrollView, Switch, Platform } from 'react-native';
import { DANGER } from '../../src/toast';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TimePicker } from '../../src/TimePicker';
import { Screen, Title, Muted, Card, AccentButton } from '../../src/ui';
import { Cat } from '../../src/Cat';
import { useStore } from '../../src/store';
import { router } from 'expo-router';
import { SKINS, COAT_GROUPS, buildTheme, useTheme, space, radius, customSkinId } from '../../src/theme';
import { formatTime } from '../../src/dates';
import { Text } from '../../src/Txt';
import { collectDiagnostics, type Diagnostics } from '../../src/diagnostics';
import {
  sendTestNotification, notificationsAvailable, nativeAlarmsAvailable, openAppSettings,
} from '../../src/notifications';
import { AccountPanel } from '../../src/AccountPanel';

export default function CatScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, customCats, updateSettings, enableNudge, forcePrompt, nudgeStatus } = useStore();
  const [showPicker, setShowPicker] = useState(Platform.OS === 'ios');
  const [diag, setDiag] = useState<Diagnostics | null>(null);

  useEffect(() => {
    if (!__DEV__) return;
    collectDiagnostics().then(setDiag);
  }, [settings.hour, settings.minute, settings.notificationsOn]);

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
          <Cat size={190} coat={t.coat} eye={t.accent} pattern={t.pattern} marks={t.marks} />
          <Text style={{ color: t.accent, fontWeight: '700', fontSize: 18, marginTop: space(1) }}>
            {t.label}
          </Text>
        </View>

        {/* coat - new tile first, then the user's cats, then presets */}
        <Card style={{ gap: space(1.5) }}>
          <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>Coat</Text>
          <Muted>
            {customCats.length
              ? "Each cat sets the whole app's colours. Long-press one of yours to edit it."
              : "Each cat sets the whole app's colours. Tap + to design your own."}
          </Muted>
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            <Pressable
              onPress={() => router.push('/cat-editor')}
              accessibilityLabel="Design a new cat"
              style={{ alignItems: 'center', gap: 6, width: 68 }}
            >
              <View style={{
                width: 64, height: 64, borderRadius: 32,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderStyle: 'dashed', borderColor: t.hairline,
              }}>
                <Text style={{ color: t.muted, fontSize: 24 }}>+</Text>
              </View>
              <Text style={{ fontSize: 11, color: t.muted }}>New</Text>
            </Pressable>

            {customCats.map(c => {
              const skinId = customSkinId(c.id);
              const active = skinId === settings.skin;
              const preview = buildTheme(skinId, customCats);
              const edit = () => router.push({ pathname: '/cat-editor', params: { id: c.id } });
              return (
                <Pressable
                  key={c.id}
                  onPress={() => (active ? edit() : updateSettings({ skin: skinId }))}
                  onLongPress={edit}
                  accessibilityLabel={active ? `Edit ${c.name}` : `Wear ${c.name}`}
                  accessibilityHint="Long-press to edit"
                  style={{ alignItems: 'center', gap: 6, width: 68 }}
                >
                  <View style={{
                    width: 64, height: 64, borderRadius: 32,
                    backgroundColor: preview.bg,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: active ? 3 : 1,
                    borderColor: active ? t.accent : t.hairline,
                  }}>
                    <Cat size={46} coat={preview.coat} eye={preview.accent} pattern={preview.pattern} marks={preview.marks} />
                  </View>
                  <Text numberOfLines={1} style={{ fontSize: 11, color: active ? t.text : t.muted }}>
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}

            {COAT_GROUPS.flatMap(g => SKINS.filter(s => s.group === g)).map(s => {
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
                    <Cat size={46} coat={preview.coat} eye={preview.accent} pattern={preview.pattern} marks={preview.marks} />
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
              onValueChange={v => (v ? enableNudge({ explain: true }) : updateSettings({ notificationsOn: false }))}
              trackColor={{ true: t.accent, false: t.hairline }}
              thumbColor={t.surface}
            />
          </View>
          <Muted>The cat asks about tomorrow at this time, every day.</Muted>
          {settings.notificationsOn && (nudgeStatus === 'denied' || nudgeStatus === 'blocked') && (
            <Pressable onPress={openAppSettings}>
              <Text style={{ color: DANGER, fontSize: 12 }}>
                Notifications are blocked for Tomorrow, so the nudge can't ring. Tap to open Settings.
              </Text>
            </Pressable>
          )}
          {settings.notificationsOn && nudgeStatus === 'failed' && (
            <Text style={{ color: DANGER, fontSize: 12 }}>
              Couldn't schedule the nudge. Try changing the time again.
            </Text>
          )}

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
            <TimePicker
              hour={settings.hour}
              minute={settings.minute}
              onChange={(hour, minute) => updateSettings({ hour, minute })}
              onClose={() => setShowPicker(false)}
            />
          )}

          {/* alarm sound - Spotify clips ring through the Android alarm service;
              shown on web too so the setting is discoverable */}
          {(nativeAlarmsAvailable || Platform.OS === 'web') && (
            <Pressable
              onPress={() => router.push('/alarm-sound')}
              accessibilityRole="button"
              style={{
                backgroundColor: t.raised, borderRadius: radius.md, padding: space(2),
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(1),
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 14 }}>Alarm sound</Text>
                <Muted style={{ fontSize: 12 }}>
                  {settings.alarmSound
                    ? `${settings.alarmSound.name} · ${((settings.alarmSound.endMs - settings.alarmSound.startMs) / 1000).toFixed(1)}s`
                    : 'Purr'}
                </Muted>
              </View>
              <Text style={{ color: t.muted, fontSize: 14 }}>{'>'}</Text>
            </Pressable>
          )}
        </Card>

        {/* debug */}
        {__DEV__ && (
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
        )}

        {__DEV__ && notificationsAvailable && (
          <AccentButton
            label="Test notification (10s)"
            onPress={() => sendTestNotification()}
          />
        )}
        
        {/* account */}
        <AccountPanel />

        <AccentButton label="Ask me about tomorrow now" onPress={forcePrompt} />
      </ScrollView>
    </Screen>
  );
}
