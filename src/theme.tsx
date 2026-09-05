import React, { createContext, useContext } from 'react';

// palette
export type CatSkin = {
  id: string;
  label: string;
  bg: string;
  surface: string;
  raised: string;
  text: string;
  muted: string;
  hairline: string;
  coat: string;
  eye: string;
  mouth: string;
  onAccent: string;
  isDark: boolean;
};

// presets
export const SKINS: CatSkin[] = [
  {
    id: 'mono',
    label: 'Mono',
    coat: '#101010', eye: '#F3C242',
    bg: '#F7F6F2', surface: '#FFFFFF', raised: '#EBE9E3',
    text: '#101010', muted: '#6E6B65', hairline: '#DDDAD3',
    onAccent: '#1A1400', isDark: false,
  },
  {
    id: 'pure',
    label: 'Pure',
    coat: '#FAFAF8', eye: '#5B8FD6',
    bg: '#0E0E0E', surface: '#1A1A1A', raised: '#262626',
    text: '#FAFAF8', muted: '#8A8A88', hairline: '#2E2E2E',
    onAccent: '#FFFFFF', isDark: true,
  },
  {
    id: 'ponkan',
    label: 'Ponkan',
    coat: '#E8752A', eye: '#3FA35F',
    bg: '#FFF8F2', surface: '#FFFFFF', raised: '#F7E4D4',
    text: '#3A2410', muted: '#8A6A50', hairline: '#EED9C4',
    onAccent: '#FFFFFF', isDark: false,
  },
  {
    id: 'kofi',
    label: 'Kofi',
    coat: '#6B4A33', eye: '#D9A05B',
    bg: '#F4EADC', surface: '#FFFFFF', raised: '#E8DAC6',
    text: '#3A2A20', muted: '#857057', hairline: '#DCCAB2',
    onAccent: '#2A1C14', isDark: false,
  },
];

export type Theme = CatSkin & { accent: string };

export function buildTheme(id: string): Theme {
  const s = SKINS.find(x => x.id === id) ?? SKINS[0];
  return { ...s, accent: s.eye };
}

export const ThemeContext = createContext<Theme>(buildTheme('mono'));
export const useTheme = () => useContext(ThemeContext);

export const radius = { sm: 0, md: 0, lg: 0, pill: 0 };
export const space = (n: number) => n * 8;