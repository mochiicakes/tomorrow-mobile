import React, { useMemo, useRef, useState } from 'react';
import { View, Pressable, type GestureResponderEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Cat, CAT_GRID_AWAKE } from './Cat';
import { useTheme, space } from './theme';
import { Text } from './Txt';
import { showToast } from './toast';
import { MAX_CAT_COLORS } from './store';

const ROWS = CAT_GRID_AWAKE.length;
const COLS = CAT_GRID_AWAKE[0].length;
const UNDO_LIMIT = 30;

export const BLANK_PIXELS = CAT_GRID_AWAKE.map(r => '.'.repeat(r.length));

const isFur = (x: number, y: number) => CAT_GRID_AWAKE[y]?.[x] === '#';
const letter = (i: number) => String.fromCharCode(97 + i);

// compact - drops colours no cell uses and relabels cells 'a'.. in palette order
export function compactPalette(pixels: string[], palette: string[]) {
  const used = new Set(pixels.join('').replace(/\./g, ''));
  const keep = palette.map((_, i) => used.has(letter(i)));
  const remap = new Map<string, string>();
  const next: string[] = [];
  palette.forEach((c, i) => {
    if (!keep[i]) return;
    remap.set(letter(i), letter(next.length));
    next.push(c);
  });
  return {
    pixels: pixels.map(r => r.replace(/[a-j]/g, ch => remap.get(ch) ?? '.')),
    palette: next,
  };
}

type Art = { pixels: string[]; palette: string[] };
type Tool = 'paint' | 'erase' | 'fill';

type Props = Art & {
  coat: string;
  eye: string;
  brush: string;
  onChange: (next: Art) => void;
  onInteract?: (active: boolean) => void;
};

function setCell(pixels: string[], x: number, y: number, ch: string) {
  const row = pixels[y];
  if (row[x] === ch) return pixels;
  const next = pixels.slice();
  next[y] = row.slice(0, x) + ch + row.slice(x + 1);
  return next;
}

// fill - 4-connected fur cells that share the start cell's colour
function floodFill(pixels: string[], sx: number, sy: number, ch: string) {
  const from = pixels[sy][sx];
  if (from === ch) return pixels;
  const rows = pixels.map(r => r.split(''));
  const stack: [number, number][] = [[sx, sy]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (!isFur(x, y) || rows[y][x] !== from) continue;
    rows[y][x] = ch;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return rows.map(r => r.join(''));
}

export function PixelEditor({ pixels, palette, coat, eye, brush, onChange, onInteract }: Props) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const [tool, setTool] = useState<Tool>('paint');
  const [sleeping, setSleeping] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const history = useRef<Art[]>([]);
  // latest art without waiting for the parent to re-render mid-stroke
  const cur = useRef<Art>({ pixels, palette });
  cur.current = { pixels, palette };
  const lastCell = useRef<string | null>(null);
  const warned = useRef(false);

  const cell = width / COLS;
  const height = cell * ROWS;

  const emit = (next: Art) => {
    if (next.pixels === cur.current.pixels && next.palette === cur.current.palette) return;
    cur.current = next;
    onChange(next);
  };

  // brush colour → cell letter, adding it to the palette if it's new
  const brushLetter = (): { ch: string; palette: string[] } | null => {
    const { pixels: px, palette: pal } = cur.current;
    if (tool === 'erase' || brush === coat) return { ch: '.', palette: pal };
    const i = pal.indexOf(brush);
    if (i >= 0) return { ch: letter(i), palette: pal };
    let room = pal;
    if (room.length >= MAX_CAT_COLORS) {
      const c = compactPalette(px, pal);
      if (c.palette.length >= MAX_CAT_COLORS) {
        if (!warned.current) showToast(`Max ${MAX_CAT_COLORS} colours. Erase one to free a slot.`);
        warned.current = true;
        return null;
      }
      cur.current = c;
      room = c.palette;
    }
    return { ch: letter(room.length), palette: [...room, brush] };
  };

  const applyAt = (e: GestureResponderEvent) => {
    if (!cell) return;
    const x = Math.floor(e.nativeEvent.locationX / cell);
    const y = Math.floor(e.nativeEvent.locationY / cell);
    const key = `${x},${y}`;
    if (key === lastCell.current || !isFur(x, y)) return;
    lastCell.current = key;
    const b = brushLetter();
    if (!b) return;
    const px = cur.current.pixels;
    const next = tool === 'fill' ? floodFill(px, x, y, b.ch) : setCell(px, x, y, b.ch);
    // only keep a newly added colour if a cell actually uses it
    emit({ pixels: next, palette: next === px ? cur.current.palette : b.palette });
  };

  const start = (e: GestureResponderEvent) => {
    onInteract?.(true);
    history.current = [...history.current.slice(-(UNDO_LIMIT - 1)), cur.current];
    setUndoCount(history.current.length);
    lastCell.current = null;
    warned.current = false;
    applyAt(e);
  };

  const end = () => {
    onInteract?.(false);
    // drop the undo step if the stroke changed nothing
    const top = history.current[history.current.length - 1];
    if (top && top.pixels === cur.current.pixels && top.palette === cur.current.palette) {
      history.current.pop();
      setUndoCount(history.current.length);
    }
  };

  const undo = () => {
    const prev = history.current.pop();
    setUndoCount(history.current.length);
    if (prev) emit(prev);
  };

  // faint grid over the fur so single pixels are easy to target
  const gridPath = useMemo(() => {
    let d = '';
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (isFur(x, y)) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return d;
  }, []);

  const ToolChip = ({ id, label }: { id: Tool; label: string }) => (
    <Chip label={label} active={tool === id} onPress={() => setTool(id)} />
  );

  return (
    <View style={{ gap: space(1.5) }}>
      <View
        style={{ width: '100%', aspectRatio: COLS / ROWS }}
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => !sleeping}
        onMoveShouldSetResponder={() => !sleeping}
        onResponderTerminationRequest={() => false}
        onResponderGrant={start}
        onResponderMove={applyAt}
        onResponderRelease={end}
        onResponderTerminate={end}
        accessibilityLabel="Cat pixel canvas"
      >
        {width > 0 && (
          <View pointerEvents="none">
            <Cat
              size={width}
              coat={coat}
              eye={eye}
              pattern={pixels}
              marks={palette}
              sleeping={sleeping}
            />
            {!sleeping && (
              <Svg
                width={width}
                height={height}
                viewBox={`0 0 ${COLS} ${ROWS}`}
                style={{ position: 'absolute', left: 0, top: 0 }}
              >
                <Path
                  d={gridPath}
                  fill="none"
                  stroke={t.isDark ? '#FFFFFF' : '#000000'}
                  strokeOpacity={0.12}
                  strokeWidth={0.04}
                />
              </Svg>
            )}
          </View>
        )}
      </View>

      {/* tools */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <ToolChip id="paint" label="Paint" />
        <ToolChip id="fill" label="Fill" />
        <ToolChip id="erase" label="Erase" />
        <Chip label="Undo" onPress={undo} disabled={!undoCount} />
        <Chip label={sleeping ? 'Awake' : 'Sleep'} onPress={() => setSleeping(s => !s)} />
      </View>
      {sleeping && (
        <Text style={{ color: t.muted, fontSize: 12 }}>Previewing the sleeping pose. Wake the cat to paint.</Text>
      )}
    </View>
  );
}

// chip - small square toggle used for tools and colour targets
export function Chip({
  label, active, onPress, disabled, swatch,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  disabled?: boolean;
  swatch?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingVertical: 8, paddingHorizontal: 12,
        borderWidth: 2,
        borderColor: active ? t.accent : t.hairline,
        backgroundColor: active ? t.raised : 'transparent',
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      {swatch && (
        <View style={{ width: 14, height: 14, backgroundColor: swatch, borderWidth: 1, borderColor: t.hairline }} />
      )}
      <Text style={{ color: active ? t.text : t.muted, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}
