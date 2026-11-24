import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, type GestureResponderEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useTheme, space } from './theme';
import { Field } from './ui';
import { hexToHsv, hsvToHex, normalizeHex, type Hsv } from './color';

type Props = {
  value: string;
  onChange: (hex: string) => void;
  swatches?: string[];
  // true while a finger is dragging, so a parent ScrollView can stop scrolling
  onInteract?: (active: boolean) => void;
};

const SQUARE_H = 170;
const HUE_H = 28;
const HUES = [0, 60, 120, 180, 240, 300, 360];
const clamp = (n: number) => Math.min(1, Math.max(0, n));

// drag area - reports 0..1 positions; the Svg inside ignores touches so
// locationX/Y are always relative to this view. Moves are coalesced to one
// update per frame: pointer events (especially on web) fire far faster than
// renders, and a setState per event trips React's update-depth guard.
function DragArea({
  height, onPos, onInteract, children,
}: {
  height: number;
  onPos: (x: number, y: number) => void;
  onInteract?: (active: boolean) => void;
  children: (width: number) => React.ReactNode;
}) {
  const [width, setWidth] = useState(0);
  const pending = useRef<[number, number] | null>(null);
  const frame = useRef<number | null>(null);
  const onPosRef = useRef(onPos);
  onPosRef.current = onPos;

  const flush = () => {
    frame.current = null;
    const p = pending.current;
    pending.current = null;
    if (p) onPosRef.current(p[0], p[1]);
  };

  useEffect(() => () => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
  }, []);

  const report = (e: GestureResponderEvent) => {
    if (!width) return;
    pending.current = [
      clamp(e.nativeEvent.locationX / width),
      clamp(e.nativeEvent.locationY / height),
    ];
    if (frame.current == null) frame.current = requestAnimationFrame(flush);
  };

  const finish = () => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    flush();
    onInteract?.(false);
  };

  return (
    <View
      style={{ height }}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={e => { onInteract?.(true); report(e); }}
      onResponderMove={report}
      onResponderRelease={finish}
      onResponderTerminate={finish}
    >
      {width > 0 && <View pointerEvents="none">{children(width)}</View>}
    </View>
  );
}

// thumb - ring that reads on any colour
function Thumb({ x, y, size = 18 }: { x: number; y: number; size?: number }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute', left: x - size / 2, top: y - size / 2,
        width: size, height: size, borderRadius: size / 2,
        borderWidth: 3, borderColor: '#FFFFFF',
        shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 2, elevation: 3,
      }}
    />
  );
}

export function ColorPicker({ value, onChange, swatches = [], onInteract }: Props) {
  const t = useTheme();
  // hsv is kept locally so hue survives greys (where hex alone would lose it)
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [text, setText] = useState(value);
  const last = useRef(value);

  useEffect(() => {
    if (value === last.current) return;
    last.current = value;
    setHsv(hexToHsv(value));
    setText(value);
  }, [value]);

  const commit = (next: Hsv) => {
    if (next.h === hsv.h && next.s === hsv.s && next.v === hsv.v) return;
    setHsv(next);
    const hex = hsvToHex(next);
    last.current = hex;
    setText(hex);
    if (hex !== value) onChange(hex);
  };

  const pickHex = (hex: string) => {
    last.current = hex;
    setHsv(hexToHsv(hex));
    setText(hex);
    if (hex !== value) onChange(hex);
  };

  const pureHue = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <View style={{ gap: space(1.5) }}>
      {/* saturation (x) / brightness (y) */}
      <DragArea
        height={SQUARE_H}
        onInteract={onInteract}
        onPos={(x, y) => commit({ ...hsv, s: x, v: 1 - y })}
      >
        {w => (
          <>
            <Svg width={w} height={SQUARE_H}>
              <Defs>
                <LinearGradient id="sat" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
                  <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
                </LinearGradient>
                <LinearGradient id="val" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#000000" stopOpacity="0" />
                  <Stop offset="1" stopColor="#000000" stopOpacity="1" />
                </LinearGradient>
              </Defs>
              <Rect width={w} height={SQUARE_H} fill={pureHue} />
              <Rect width={w} height={SQUARE_H} fill="url(#sat)" />
              <Rect width={w} height={SQUARE_H} fill="url(#val)" />
            </Svg>
            <Thumb x={hsv.s * w} y={(1 - hsv.v) * SQUARE_H} />
          </>
        )}
      </DragArea>

      {/* hue */}
      <DragArea
        height={HUE_H}
        onInteract={onInteract}
        onPos={x => commit({ ...hsv, h: Math.min(359.9, x * 360) })}
      >
        {w => (
          <>
            <Svg width={w} height={HUE_H}>
              <Defs>
                <LinearGradient id="hue" x1="0" y1="0" x2="1" y2="0">
                  {HUES.map(h => (
                    <Stop key={h} offset={String(h / 360)} stopColor={hsvToHex({ h: h % 360, s: 1, v: 1 })} />
                  ))}
                </LinearGradient>
              </Defs>
              <Rect width={w} height={HUE_H} fill="url(#hue)" />
            </Svg>
            <Thumb x={(hsv.h / 360) * w} y={HUE_H / 2} size={22} />
          </>
        )}
      </DragArea>

      {/* hex + current */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5) }}>
        <View style={{
          width: 44, height: 44, backgroundColor: value,
          borderWidth: 2, borderColor: t.hairline,
        }} />
        <Field
          value={text}
          onChangeText={v => {
            setText(v);
            const hex = normalizeHex(v);
            if (hex) pickHex(hex);
          }}
          onBlur={() => setText(value)}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          style={{ flex: 1 }}
          accessibilityLabel="Hex colour"
        />
      </View>

      {/* swatches */}
      {swatches.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {swatches.map(c => (
            <Pressable
              key={c}
              onPress={() => pickHex(c)}
              accessibilityLabel={`Colour ${c}`}
              style={{
                width: 30, height: 30, backgroundColor: c,
                borderWidth: c === value ? 3 : 1,
                borderColor: c === value ? t.accent : t.hairline,
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
