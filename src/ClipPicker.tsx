import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, PanResponder, type LayoutChangeEvent } from 'react-native';
import { useTheme, space } from './theme';
import { Text } from './Txt';
import { Muted } from './ui';
import { Arrow } from './controls';
import { MIN_CLIP_MS, MAX_CLIP_MS } from './spotify';

const ZOOM_MS = 30_000;
const STEP_MS = 100;
const HANDLE = 28;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const snap = (ms: number) => Math.round(ms / STEP_MS) * STEP_MS;

export function fmtMs(ms: number): string {
  const m = Math.floor(ms / 60_000);
  const s = (ms % 60_000) / 1000;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

type Clip = { start: number; end: number };

// keeps a clip inside the track and between the min/max lengths, moving `fixed`'s opposite edge
function fitClip(c: Clip, duration: number, fixed: 'start' | 'end' | 'length'): Clip {
  if (fixed === 'length') {
    const len = c.end - c.start;
    const start = clamp(c.start, 0, duration - len);
    return { start, end: start + len };
  }
  if (fixed === 'start') {
    const end = clamp(c.end, c.start + MIN_CLIP_MS, Math.min(duration, c.start + MAX_CLIP_MS));
    return { start: c.start, end };
  }
  const start = clamp(c.start, Math.max(0, c.end - MAX_CLIP_MS), c.end - MIN_CLIP_MS);
  return { start, end: c.end };
}

// view - a ZOOM_MS window that contains the clip, centred on it where possible
function viewFor(c: Clip, duration: number): number {
  const span = Math.min(ZOOM_MS, duration);
  return clamp((c.start + c.end) / 2 - span / 2, 0, duration - span);
}

// picker - drag the window on the whole-track bar, then fine-tune each edge on the zoomed strip
export function ClipPicker({
  durationMs, startMs, endMs, onChange,
}: {
  durationMs: number;
  startMs: number;
  endMs: number;
  onChange: (startMs: number, endMs: number) => void;
}) {
  const t = useTheme();
  const span = Math.min(ZOOM_MS, durationMs);
  const [view, setView] = useState(() => viewFor({ start: startMs, end: endMs }, durationMs));
  const [barW, setBarW] = useState(1);
  const [stripW, setStripW] = useState(1);

  // latest values for the responders, which are created once
  const live = useRef({ startMs, endMs, durationMs, view, span, barW, stripW, onChange });
  live.current = { startMs, endMs, durationMs, view, span, barW, stripW, onChange };

  // follow the clip if it leaves the zoomed view (e.g. after an overview drag)
  useEffect(() => {
    if (startMs < view || endMs > view + span) setView(viewFor({ start: startMs, end: endMs }, durationMs));
  }, [startMs, endMs, durationMs]);

  const emit = (c: Clip) => live.current.onChange(snap(c.start), snap(c.end));

  // overview - the clip's centre follows the finger
  const overview = useMemo(() => {
    let grantX = 0;
    const place = (x: number) => {
      const { startMs: s, endMs: e, durationMs: d, barW: w } = live.current;
      const len = e - s;
      const centre = (clamp(x, 0, w) / w) * d;
      emit(fitClip({ start: centre - len / 2, end: centre + len / 2 }, d, 'length'));
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: e => {
        grantX = e.nativeEvent.locationX;
        place(grantX);
      },
      onPanResponderMove: (_, g) => place(grantX + g.dx),
    });
  }, []);

  // strip - three drag targets: each edge, and the body to slide the whole clip
  const makeDrag = (part: 'start' | 'end' | 'body') => {
    let from: Clip = { start: 0, end: 0 };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        from = { start: live.current.startMs, end: live.current.endMs };
      },
      onPanResponderMove: (_, g) => {
        const { durationMs: d, span: sp, stripW: w } = live.current;
        const dMs = (g.dx / w) * sp;
        if (part === 'start') emit(fitClip({ start: from.start + dMs, end: from.end }, d, 'end'));
        else if (part === 'end') emit(fitClip({ start: from.start, end: from.end + dMs }, d, 'start'));
        else emit(fitClip({ start: from.start + dMs, end: from.end + dMs }, d, 'length'));
      },
    });
  };
  const startDrag = useMemo(() => makeDrag('start'), []);
  const endDrag = useMemo(() => makeDrag('end'), []);
  const bodyDrag = useMemo(() => makeDrag('body'), []);

  const nudge = (edge: 'start' | 'end', delta: number) => {
    const c = { start: startMs, end: endMs };
    c[edge] += delta;
    emit(fitClip(c, durationMs, edge === 'start' ? 'end' : 'start'));
  };

  const toBar = (ms: number) => (ms / durationMs) * barW;
  const toStrip = (ms: number) => ((ms - view) / span) * stripW;

  // second ticks across the zoomed view, labelled every 5s
  const ticks: number[] = [];
  for (let s = Math.ceil(view / 1000) * 1000; s <= view + span; s += 1000) ticks.push(s);

  const len = endMs - startMs;

  return (
    <View style={{ gap: space(2) }}>
      {/* overview */}
      <View style={{ gap: 6 }}>
        <Muted style={{ fontSize: 12 }}>Whole song · drag to place the clip</Muted>
        <View
          onLayout={(e: LayoutChangeEvent) => setBarW(Math.max(1, e.nativeEvent.layout.width))}
          {...overview.panHandlers}
          style={{ height: 36, backgroundColor: t.raised, borderWidth: 2, borderColor: t.hairline, justifyContent: 'center' }}
        >
          {/* zoom window outline */}
          <View pointerEvents="none" style={{
            position: 'absolute', top: 2, bottom: 2,
            left: toBar(view), width: Math.max(toBar(span), 2),
            borderWidth: 1, borderColor: t.muted,
          }} />
          <View pointerEvents="none" style={{
            position: 'absolute', top: 0, bottom: 0,
            left: toBar(startMs), width: Math.max(toBar(len), 4),
            backgroundColor: t.eye,
          }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Muted style={{ fontSize: 11 }}>0:00</Muted>
          <Muted style={{ fontSize: 11 }}>{fmtMs(durationMs)}</Muted>
        </View>
      </View>

      {/* zoomed strip */}
      <View style={{ gap: 6 }}>
        <Muted style={{ fontSize: 12 }}>Close-up · drag the edges to trim</Muted>
        <View
          onLayout={(e: LayoutChangeEvent) => setStripW(Math.max(1, e.nativeEvent.layout.width))}
          style={{ height: 64, backgroundColor: t.raised, borderWidth: 2, borderColor: t.hairline }}
        >
          {ticks.map(ms => (
            <View key={ms} pointerEvents="none" style={{
              position: 'absolute', left: toStrip(ms), bottom: 0,
              width: 1, height: ms % 5000 === 0 ? 16 : 8, backgroundColor: t.muted,
            }} />
          ))}

          {/* clip body */}
          <View {...bodyDrag.panHandlers} style={{
            position: 'absolute', top: 0, bottom: 0,
            left: toStrip(startMs), width: Math.max(toStrip(endMs) - toStrip(startMs), 2),
            backgroundColor: t.eye, opacity: 0.45,
          }} />

          {/* edges */}
          {(['start', 'end'] as const).map(edge => (
            <View
              key={edge}
              {...(edge === 'start' ? startDrag : endDrag).panHandlers}
              hitSlop={{ top: 12, bottom: 12 }}
              style={{
                position: 'absolute', top: -6, bottom: -6, width: HANDLE,
                left: toStrip(edge === 'start' ? startMs : endMs) - HANDLE / 2,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <View style={{ width: 6, height: '100%', backgroundColor: t.eye }} />
              <View style={{ position: 'absolute', width: 14, height: 22, backgroundColor: t.eye, borderWidth: 2, borderColor: t.bg }} />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Muted style={{ fontSize: 11 }}>{fmtMs(view)}</Muted>
          <Muted style={{ fontSize: 11 }}>{fmtMs(view + span)}</Muted>
        </View>
      </View>

      {/* fine tune */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        {(['start', 'end'] as const).map(edge => (
          <View key={edge} style={{ alignItems: 'center', gap: 6 }}>
            <Muted style={{ fontSize: 11 }}>{edge === 'start' ? 'Start' : 'End'}</Muted>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Arrow dir="left" onPress={() => nudge(edge, -STEP_MS)} />
              <Text style={{ color: t.text, fontSize: 13, minWidth: 56, textAlign: 'center' }}>
                {fmtMs(edge === 'start' ? startMs : endMs)}
              </Text>
              <Arrow dir="right" onPress={() => nudge(edge, STEP_MS)} />
            </View>
          </View>
        ))}
      </View>
      <Text style={{ color: t.accent, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>
        {(len / 1000).toFixed(1)}s clip
      </Text>
    </View>
  );
}
