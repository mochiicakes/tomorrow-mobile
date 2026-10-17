import React, { useMemo } from "react";
import Svg, { Path } from "react-native-svg";

type Props = {
  size?: number;
  coat: string;
  eye: string;
  pupil?: string;
  sleeping?: boolean;
  mouth?: string;
  pattern?: PatternId;
  marks?: string[];
};

// grid
const AWAKE = [
  ".....................",
  ".....................",
  "....##.........##....",
  "...####.......####...",
  "...#####.....#####...",
  "...###############...",
  "..#################..",
  "..#################..",
  "..###yy#######yy###..",
  "..##yppy#####yppy##..",
  "..##yppy#####yppy##..",
  "..###yy###w###yy###..",
  "..#######w#w#######..",
  "..#################..",
  "...###############...",
  "...###############...",
  ".....###########.....",
  ".....................",
  ".....................",
];

const ASLEEP = [
  ".....................",
  ".....................",
  "....##.........##....",
  "...####.......####...",
  "...#####.....#####...",
  "...###############...",
  "..#################..",
  "..#################..",
  "..#################..",
  "..#################..",
  "..##y##y#####y##y##..",
  "..###yy###w###yy###..",
  "..#######w#w#######..",
  "..#################..",
  "...###############...",
  "...###############...",
  ".....###########.....",
  ".....................",
  ".....................",
];

// patterns - 'a'/'b'/'c' recolour coat cells with marks[0]/[1]/[2]; eyes and mouth are never touched
export const PATTERNS = {
  tabby: [
    ".....................",
    ".....................",
    ".....................",
    ".....................",
    ".....................",
    "........a.a.a........",
    "........a.a.a........",
    ".........a.a.........",
    ".....................",
    "..aa.............aa..",
    ".....................",
    "..aa.............aa..",
    ".....................",
    ".....................",
    "...a.a.........a.a...",
    "...a.a.........a.a...",
    ".....................",
    ".....................",
    ".....................",
  ],
  calico: [
    ".....................",
    ".....................",
    "....aa.........bb....",
    "...aaa........bbbb...",
    "...aaaa......bbbbb...",
    "...aaaa.......bbbb...",
    "..aaaa.........bbb...",
    "..aaa...........bb...",
    "..aa.................",
    ".....................",
    ".....................",
    ".....................",
    ".....................",
    "................aa...",
    "...bbb.........aaa...",
    "...bbbb........aaa...",
    ".....bb..............",
    ".....................",
    ".....................",
  ],
  tuxedo: [
    ".....................",
    ".....................",
    ".....................",
    ".....................",
    ".....................",
    ".....................",
    ".....................",
    "..........a..........",
    ".........aaa.........",
    ".........aaa.........",
    "........aaaaa........",
    ".......aaaaaaa.......",
    "......aaaaaaaaa......",
    ".....aaaaaaaaaaa.....",
    ".....aaaaaaaaaaa.....",
    "......aaaaaaaaa......",
    ".......aaaaaaa.......",
    ".....................",
    ".....................",
  ],
  siamese: [
    ".....................",
    ".....................",
    "....aa.........aa....",
    "...aaaa.......aaaa...",
    "...aaa.........aaa...",
    ".....................",
    ".....................",
    ".....................",
    ".....................",
    ".....................",
    ".........aaa.........",
    "........aaaaa........",
    "........aaaaa........",
    ".........aaa.........",
    ".....................",
    ".....................",
    ".....................",
    ".....................",
    ".....................",
  ],
  // puspin - broken dark stripes, rust ears/brows/nose, cream muzzle
  tilapia: [
    ".....................",
    ".....................",
    "....ab.........ba....",
    "...abb.........bba...",
    "...a.b.a.....a.b.a...",
    "...a..b.a.aa.a..ba...",
    "..a.bb..a.a.a..bb.a..",
    "...abbb..a.a..bbba...",
    "..a.b..b..b..b..b.a..",
    "..aa......b......aa..",
    "...a.....bbb.....a...",
    "..aa....cc.cc....aa..",
    "...a...cc.c.cc...a...",
    "..a.a...ccccc...a.a..",
    "...aa.a.......a.aa...",
    "....a.aa.....aa.a....",
    ".....a.a.....a.a.....",
    ".....................",
    ".....................",
  ],
  // mottled orange + red-brown over black, no white
  tortie: [
    ".....................",
    ".....................",
    "....aa...............",
    "...aaa...............",
    "...aaaa..............",
    "...aaaaa.............",
    "..aaaa...............",
    "..aa...........bb....",
    "..a.............bbb..",
    "................bbb..",
    "...............bbbb..",
    "................bbb..",
    "...............bbb...",
    "..aa.................",
    "...aaa...............",
    "...aa.........aaa....",
    ".............aa......",
    ".....................",
    ".....................",
  ],
  // white with tabby patches - striped cap + blaze, one cheek, one flank
  bicolor: [
    ".....................",
    ".....................",
    "....aa.........aa....",
    "...aaba.......abaa...",
    "...aabaa.....aabaa...",
    "...aaabababababaaa...",
    "..aabaaba...abaabaa..",
    "..abaaba.....abaaba..",
    "..aba..a........aba..",
    "..ab.............ba..",
    "..ba.................",
    "..aba................",
    "..abaa...............",
    "..aaba...............",
    "...ab........ababa...",
    "...a.........ababa...",
    ".............aba.....",
    ".....................",
    ".....................",
  ],
  // long hair - ear tufts, cheek ruff, jagged chest fur
  fluff: [
    ".....................",
    ".....................",
    ".....................",
    ".....a.........a.....",
    ".....aa.......aa.....",
    ".....................",
    "..a...............a..",
    "..a...............a..",
    "..a...............a..",
    "..aa.............aa..",
    "..a.a.............a..",
    "..aa.............aa..",
    "..a...............a..",
    "..aa.............aa..",
    "...a.a.........a.a...",
    "...aa...a.a.a...aa...",
    ".....a.a.a.a.a.a.....",
    ".....................",
    ".....................",
  ],
};

export type PatternId = keyof typeof PATTERNS;

// paths - one <Path> per colour (row runs merged) instead of one <Rect> per pixel
function buildPaths(
  grid: string[],
  colorAt: (ch: string, x: number, y: number) => string
) {
  const paths = new Map<string, string>();
  const add = (color: string, x: number, y: number, w: number) =>
    paths.set(color, (paths.get(color) ?? "") + `M${x} ${y}h${w}v1h${-w}z`);

  grid.forEach((line, y) => {
    let runColor = "";
    let runStart = 0;
    for (let x = 0; x <= line.length; x++) {
      const ch = line[x];
      const color = ch && ch !== "." ? colorAt(ch, x, y) : "";
      if (color === runColor) continue;
      if (runColor) add(runColor, runStart, y, x - runStart);
      runColor = color;
      runStart = x;
    }
  });
  return paths;
}

// render
export const Cat = React.memo(function Cat({
  size = 168,
  coat,
  eye,
  pupil = "#000000",
  mouth = "#E08BA0",
  sleeping = false,
  pattern,
  marks = [],
}: Props) {
  const grid = sleeping ? ASLEEP : AWAKE;
  const cols = grid[0].length;
  const rows = grid.length;
  const marksKey = marks.join(",");

  const { silhouette, paths } = useMemo(() => {
    const over = pattern ? PATTERNS[pattern] : undefined;
    const colorAt = (ch: string, x: number, y: number) => {
      if (ch === "y") return eye;
      if (ch === "p") return pupil;
      if (ch === "w") return mouth;
      const m = over?.[y]?.[x];
      return (
        (m === "a" && marks[0]) ||
        (m === "b" && marks[1]) ||
        (m === "c" && marks[2]) ||
        coat
      );
    };
    return {
      // solid coat underneath so anti-aliased seams between colours never show through
      silhouette: buildPaths(grid, () => coat).get(coat) ?? "",
      paths: [...buildPaths(grid, colorAt)].filter(([c]) => c !== coat),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, coat, eye, pupil, mouth, pattern, marksKey]);

  return (
    <Svg
      width={size}
      height={(size * rows) / cols}
      viewBox={`0 0 ${cols} ${rows}`}
    >
      <Path d={silhouette} fill={coat} />
      {paths.map(([color, d]) => (
        <Path key={color} d={d} fill={color} />
      ))}
    </Svg>
  );
});
