import React from 'react';
import Svg, { Rect, G } from 'react-native-svg';

type Props = {
  size?: number;
  coat: string;
  eye: string;
  pupil?: string;
  sleeping?: boolean;
  mouth?: string;
};



// grid
const AWAKE = [
  '.....................',
  '.....................',
  '....##.........##....',
  '...####.......####...',
  '...#####.....#####...',
  '...###############...',
  '..#################..',
  '..#################..',
  '..###yy#######yy###..',
  '..##yppy#####yppy##..',
  '..##yppy#####yppy##..',
  '..###yy###w###yy###..',
  '..#######w#w#######..',
  '..#################..',
  '...###############...',
  '...###############...',
  '.....###########.....',
  '.....................',
  '.....................',
];

const ASLEEP = [
  '.....................',
  '.....................',
  '....##.........##....',
  '...####.......####...',
  '...#####.....#####...',
  '...###############...',
  '..#################..',
  '..#################..',
  '..#################..',
  '..#################..',
  '..##y##y#####y##y##..',
  '..###yy###w###yy###..',
  '..#######w#w#######..',
  '..#################..',
  '...###############...',
  '...###############...',
  '.....###########.....',
  '.....................',
  '.....................',
];

// render
export function Cat({ size = 168, coat, eye, pupil = '#000000', mouth = '#E08BA0', sleeping = false }: Props) {  const grid = sleeping ? ASLEEP : AWAKE;
  const cols = grid[0].length;
  const rows = grid.length;
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
          fill={ch === 'y' ? eye : ch === 'p' ? pupil : ch === 'w' ? mouth : coat}
        />,
      );
    });
  });

  const h = cell * rows;
  return (
    <Svg width={size} height={h} viewBox={`0 0 ${size} ${h}`}>
      <G>{cells}</G>
    </Svg>
  );
}