import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, ScrollView, Pressable, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Screen, Title, Muted, Card, Field, AccentButton, GhostButton } from '../src/ui';
import { Text } from '../src/Txt';
import { Cat } from '../src/Cat';
import { ColorPicker } from '../src/ColorPicker';
import { PixelEditor, Chip, BLANK_PIXELS, compactPalette } from '../src/PixelEditor';
import { useStore, MAX_CAT_NAME } from '../src/store';
import { SKINS, BACKDROPS, useTheme, space, customSkinId, backdropSurfaces } from '../src/theme';
import { DANGER } from '../src/toast';

type Target = 'brush' | 'coat' | 'eye';

const TARGETS: { id: Target; label: string }[] = [
  { id: 'brush', label: 'Brush' },
  { id: 'coat', label: 'Fur' },
  { id: 'eye', label: 'Eyes' },
];

const unique = (xs: string[]) => [...new Set(xs)];

export default function CatEditorScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { customCats, saveCustomCat, deleteCustomCat, updateSettings } = useStore();
  const existing = id ? customCats.find(c => c.id === id) : undefined;

  // start - an existing cat, or a blank one on the current backdrop
  const initial = useMemo(() => {
    if (existing) {
      return {
        name: existing.name, coat: existing.coat, eye: existing.eye, backdrop: existing.backdrop,
        pixels: existing.pixels, palette: existing.palette,
      };
    }
    // start on the background the app is showing right now
    return {
      name: '', coat: t.coat, eye: t.eye, backdrop: t.bg.toUpperCase(),
      pixels: BLANK_PIXELS, palette: [] as string[],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [name, setName] = useState(initial.name);
  const [coat, setCoat] = useState(initial.coat);
  const [eye, setEye] = useState(initial.eye);
  const [backdrop, setBackdrop] = useState(initial.backdrop);
  const [art, setArt] = useState({ pixels: initial.pixels, palette: initial.palette });
  const [brush, setBrush] = useState(initial.palette[0] ?? '#FFFFFF');
  const [target, setTarget] = useState<Target>('brush');
  const [dragging, setDragging] = useState(false);
  const leaving = useRef(false);

  const changed =
    name !== initial.name || coat !== initial.coat || eye !== initial.eye ||
    backdrop !== initial.backdrop || art.pixels !== initial.pixels || art.palette !== initial.palette;
  const changedRef = useRef(changed);
  changedRef.current = changed;

  // the cat was deleted elsewhere (e.g. by a sync) while this screen was open
  useEffect(() => {
    if (id && !existing && !leaving.current) {
      leaving.current = true;
      router.back();
    }
  }, [id, existing]);

  // leave - ask before throwing away edits, including the Android back button
  useEffect(() => navigation.addListener('beforeRemove', e => {
    if (leaving.current || !changedRef.current) return;
    e.preventDefault();
    Alert.alert('Discard changes?', 'Your edits to this cat will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          leaving.current = true;
          navigation.dispatch(e.data.action);
        },
      },
    ]);
  }), [navigation]);

  const pickerValue = target === 'coat' ? coat : target === 'eye' ? eye : brush;
  const setPicker = target === 'coat' ? setCoat : target === 'eye' ? setEye : setBrush;
  const swatches = useMemo(
    () => unique([...art.palette, ...SKINS.map(s => s.coat), ...SKINS.map(s => s.eye)]).slice(0, 24),
    [art.palette],
  );
  const backdropBg = backdropSurfaces(backdrop).bg;

  const save = () => {
    const compact = compactPalette(art.pixels, art.palette);
    const savedId = saveCustomCat({
      id: existing?.id, name, coat, eye, backdrop,
      pixels: compact.pixels, palette: compact.palette,
    });
    updateSettings({ skin: customSkinId(savedId) });
    leaving.current = true;
    router.back();
  };

  const remove = () => {
    if (!existing) return;
    Alert.alert('Delete this cat?', `"${existing.name}" will be removed from every device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          leaving.current = true;
          deleteCustomCat(existing.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          scrollEnabled={!dragging}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingTop: insets.top + space(1),
            paddingHorizontal: space(2),
            paddingBottom: insets.bottom + space(6),
            gap: space(2),
          }}
        >
          {/* header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5) }}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={{
                width: 34, height: 30,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: t.hairline,
              }}
            >
              <Text style={{ color: t.text, fontSize: 14 }}>{'<'}</Text>
            </Pressable>
            <Title>{existing ? 'Edit cat' : 'New cat'}</Title>
          </View>

          {/* name */}
          <Field
            value={name}
            onChangeText={setName}
            placeholder="Name your cat"
            maxLength={MAX_CAT_NAME}
            autoCorrect={false}
          />

          {/* canvas - shown on the chosen backdrop */}
          <Card style={{ gap: space(1.5), backgroundColor: backdropBg }}>
            <PixelEditor
              pixels={art.pixels}
              palette={art.palette}
              coat={coat}
              eye={eye}
              brush={brush}
              onChange={setArt}
              onInteract={setDragging}
            />
          </Card>

          {/* colours */}
          <Card style={{ gap: space(1.5) }}>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {TARGETS.map(x => (
                <Chip
                  key={x.id}
                  label={x.label}
                  active={target === x.id}
                  swatch={x.id === 'coat' ? coat : x.id === 'eye' ? eye : brush}
                  onPress={() => setTarget(x.id)}
                />
              ))}
            </View>
            <Muted style={{ fontSize: 12 }}>
              {target === 'brush'
                ? 'Brush paints pixels. Painting with the fur colour clears them.'
                : target === 'coat'
                  ? 'Base fur colour under every unpainted pixel.'
                  : 'Eye colour, also used as the app accent.'}
            </Muted>
            <ColorPicker
              value={pickerValue}
              onChange={setPicker}
              swatches={swatches}
              onInteract={setDragging}
            />
          </Card>

          {/* backdrop */}
          <Card style={{ gap: space(1.5) }}>
            <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>Backdrop</Text>
            <Muted>The app background. Cards and text adjust to match.</Muted>
            {/* grid - 8 per row: light neutrals, light tints, dark neutrals, dark tints */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 }}>
              {BACKDROPS.map(c => {
                const active = c === backdropBg.toUpperCase();
                return (
                  <View key={c} style={{ width: '12.5%', aspectRatio: 1, padding: 3 }}>
                    <Pressable
                      onPress={() => setBackdrop(c)}
                      accessibilityLabel={`Backdrop ${c}`}
                      accessibilityState={{ selected: active }}
                      style={{
                        flex: 1,
                        backgroundColor: c,
                        borderWidth: active ? 3 : 1,
                        borderColor: active ? t.accent : t.hairline,
                      }}
                    />
                  </View>
                );
              })}
            </View>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: space(1.5),
              backgroundColor: backdropBg, padding: space(1),
              borderWidth: 1, borderColor: t.hairline,
            }}>
              <Cat size={40} coat={coat} eye={eye} pattern={art.pixels} marks={art.palette} />
              <Text style={{ color: backdropSurfaces(backdrop).text, fontSize: 12 }}>
                {name.trim() || 'Your cat'} on {backdropBg.toUpperCase()}
              </Text>
            </View>
          </Card>

          <AccentButton label={existing ? 'Save changes' : 'Save cat'} onPress={save} />
          <GhostButton label="Cancel" onPress={() => router.back()} />
          {existing && (
            <Pressable onPress={remove} style={{ alignItems: 'center', paddingVertical: space(2) }}>
              <Text style={{ color: DANGER, fontSize: 13 }}>Delete cat</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
