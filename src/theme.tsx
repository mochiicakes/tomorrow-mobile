import React, { createContext, useContext } from 'react';
import type { PatternId } from './Cat';

// groups - picker order
export const COAT_GROUPS = ['solid', 'tabby', 'bicolor', 'tortie', 'pointed', 'longhair'] as const;

export type CoatGroup = (typeof COAT_GROUPS)[number];

// palette
export type CatSkin = {
  id: string;
  label: string;
  group: CoatGroup;
  bg: string;
  surface: string;
  raised: string;
  text: string;
  muted: string;
  hairline: string;
  coat: string;
  eye: string;
  mouth?: string;
  pattern?: PatternId;
  marks?: string[];
  onAccent: string;
  isDark: boolean;
};

// presets
export const SKINS: CatSkin[] = [
  {
    id: 'mono',
    label: 'Mono',
    group: 'solid',
    coat: '#101010', eye: '#F3C242',
    bg: '#F7F6F2', surface: '#FFFFFF', raised: '#EBE9E3',
    text: '#101010', muted: '#6E6B65', hairline: '#DDDAD3',
    onAccent: '#1A1400', isDark: false,
  },
  {
    id: 'pure',
    label: 'Pure',
    group: 'solid',
    coat: '#FAFAF8', eye: '#5B8FD6',
    bg: '#0E0E0E', surface: '#1A1A1A', raised: '#262626',
    text: '#FAFAF8', muted: '#8A8A88', hairline: '#2E2E2E',
    onAccent: '#FFFFFF', isDark: true,
  },
  {
    id: 'ponkan',
    label: 'Ponkan',
    group: 'tabby',
    coat: '#E8752A', eye: '#3FA35F',
    pattern: 'tabby', marks: ['#B4521A'],
    bg: '#FFF8F2', surface: '#FFFFFF', raised: '#F7E4D4',
    text: '#3A2410', muted: '#8A6A50', hairline: '#EED9C4',
    onAccent: '#FFFFFF', isDark: false,
  },
  {
    id: 'kofi',
    label: 'Kofi',
    group: 'solid',
    coat: '#6B4A33', eye: '#D9A05B',
    bg: '#F4EADC', surface: '#FFFFFF', raised: '#E8DAC6',
    text: '#3A2A20', muted: '#857057', hairline: '#DCCAB2',
    onAccent: '#2A1C14', isDark: false,
  },
  {
    id: 'blue',
    label: 'Blue',
    group: 'solid',
    coat: '#7D8B9A', eye: '#58B368',
    bg: '#EDF1F5', surface: '#FFFFFF', raised: '#DDE4EB',
    text: '#1E2833', muted: '#687687', hairline: '#D0D8E1',
    onAccent: '#0B1F0E', isDark: false,
  },
  {
    id: 'oreo',
    label: 'Oreo',
    group: 'tabby',
    coat: '#8E8C86', eye: '#7FB548',
    pattern: 'tabby', marks: ['#45433F'],
    bg: '#F3F2EF', surface: '#FFFFFF', raised: '#E6E4DF',
    text: '#22211F', muted: '#706E69', hairline: '#DAD8D2',
    onAccent: '#14200A', isDark: false,
  },
  {
    id: 'calico',
    label: 'Calico',
    group: 'tortie',
    coat: '#FBF7EF', eye: '#3E9C9A',
    pattern: 'calico', marks: ['#E0873A', '#2E2722'],
    bg: '#EDE4D6', surface: '#FFFBF4', raised: '#E2D6C4',
    text: '#33281F', muted: '#85735F', hairline: '#D9CBB6',
    onAccent: '#FFFFFF', isDark: false,
  },
  {
    id: 'tuxedo',
    label: 'Tuxedo',
    group: 'bicolor',
    coat: '#141414', eye: '#7CC24A',
    pattern: 'tuxedo', marks: ['#F5F3EE'],
    bg: '#E9ECEF', surface: '#FFFFFF', raised: '#DCE0E4',
    text: '#141414', muted: '#6A7078', hairline: '#CFD4DA',
    onAccent: '#0F1A06', isDark: false,
  },
  {
    id: 'siamese',
    label: 'Siamese',
    group: 'pointed',
    coat: '#F1E6D2', eye: '#4F86D9',
    pattern: 'siamese', marks: ['#4B3628'],
    bg: '#211B18', surface: '#2D2521', raised: '#3A302B',
    text: '#F4EBDD', muted: '#A8988A', hairline: '#3F3530',
    onAccent: '#FFFFFF', isDark: true,
  },
  {
    id: 'tilapia',
    label: 'Tilapia',
    group: 'tabby',
    coat: '#7D6E5D', eye: '#B5B83A',
    pattern: 'tilapia', marks: ['#2B231D', '#B9793F', '#D8C8AE'],
    bg: '#EFEAE2', surface: '#FFFFFF', raised: '#E2DACE',
    text: '#2B231D', muted: '#7D6E5D', hairline: '#D6CCBE',
    onAccent: '#1E2206', isDark: false,
  },
  {
    id: 'tortie',
    label: 'Tortie',
    group: 'tortie',
    coat: '#1E1A18', eye: '#D9A23A',
    pattern: 'tortie', marks: ['#D2702C', '#7A3B1E'],
    bg: '#F6EFE8', surface: '#FFFFFF', raised: '#EADFD3',
    text: '#231B16', muted: '#7F6E62', hairline: '#E0D3C6',
    onAccent: '#1F1405', isDark: false,
  },
  {
    id: 'cheddar',
    label: 'Cheddar',
    group: 'bicolor',
    coat: '#FBFAF7', eye: '#4FA35A',
    pattern: 'bicolor', marks: ['#E58A3A', '#B4561C'],
    bg: '#F4E7D8', surface: '#FFFCF8', raised: '#EAD8C4',
    text: '#3A2410', muted: '#8A6A50', hairline: '#E3CFB9',
    onAccent: '#FFFFFF', isDark: false,
  },
  {
    id: 'bonsai',
    label: 'Bonsai',
    group: 'bicolor',
    coat: '#FBFAF7', eye: '#D79A3B',
    pattern: 'bicolor', marks: ['#8A6440', '#4E3622'],
    bg: '#E5E9DD', surface: '#FBFCF8', raised: '#D7DDCC',
    text: '#2A2C22', muted: '#6E735F', hairline: '#CCD3C0',
    onAccent: '#24170A', isDark: false,
  },
  {
    id: 'pebbles',
    label: 'Pebbles',
    group: 'bicolor',
    coat: '#FBFAF7', eye: '#9DBB45',
    pattern: 'bicolor', marks: ['#8F949B', '#4F535A'],
    bg: '#E3E7EC', surface: '#FBFCFD', raised: '#D5DAE1',
    text: '#1E2228', muted: '#69707A', hairline: '#CAD0D8',
    onAccent: '#1A2208', isDark: false,
  },
  {
    id: 'snow',
    label: 'Snow',
    group: 'longhair',
    coat: '#FFFFFF', eye: '#D9873A',
    pattern: 'fluff', marks: ['#DAD8D4'],
    bg: '#E4EAF0', surface: '#F7F9FB', raised: '#D6DEE6',
    text: '#1F2A35', muted: '#6B7886', hairline: '#CBD4DD',
    onAccent: '#FFFFFF', isDark: false,
  },
  {
    id: 'smoke',
    label: 'Smoke',
    group: 'longhair',
    coat: '#45484D', eye: '#E39A3B',
    pattern: 'fluff', marks: ['#9AA0A8'],
    bg: '#ECEDEF', surface: '#FFFFFF', raised: '#DEE0E3',
    text: '#1C1E21', muted: '#6C7077', hairline: '#D3D6DA',
    onAccent: '#1F1405', isDark: false,
  },
  {
    id: 'coal',
    label: 'Coal',
    group: 'longhair',
    coat: '#121212', eye: '#E07B39',
    pattern: 'fluff', marks: ['#3D3936'],
    bg: '#EFEBE6', surface: '#FFFFFF', raised: '#E3DDD6',
    text: '#141210', muted: '#736A62', hairline: '#D8D1C9',
    onAccent: '#FFFFFF', isDark: false,
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