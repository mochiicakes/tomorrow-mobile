import React from 'react';
import Svg, { Rect } from 'react-native-svg';

export const ICONS = {
  tomorrow: [
    '..###..',
    '.##..#.',
    '##.....',
    '##.....',
    '##.....',
    '.##..#.',
    '..###..',
  ],
  today: [
    '...#...',
    '.#.#.#.',
    '..###..',
    '#######',
    '..###..',
    '.#.#.#.',
    '...#...',
  ],
  later: [
    '.#...#.',
    '#######',
    '#######',
    '#.#.#.#',
    '#######',
    '#.#.#.#',
    '#######',
  ],
  cat: [
    '#.....#',
    '##...##',
    '#######',
    '#######',
    '#######',
    '#..#..#',
    '.#####.',
  ],
};

export function PixelIcon({
  grid, color, size = 21,
}: { grid: string[]; color: string; size?: number }) {
  const cols = grid[0].length;
  const cell = size / cols;
  const cells: React.ReactElement[] = [];

  grid.forEach((line, y) => {
    line.split('').forEach((ch, x) => {
      if (ch === '.') return;
      cells.push(
        <Rect
          key={`${x}-${y}`}
          x={x * cell}
          y={y * cell}
          width={cell + 0.5}
          height={cell + 0.5}
          fill={color}
        />,
      );
    });
  });

  return <Svg width={size} height={size}>{cells}</Svg>;
}