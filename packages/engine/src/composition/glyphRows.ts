import type { GlyphrameBackground } from '@glyphrame/schemas';

const GLYPHS = '01#@$%&*+=-:.<>/\\[]{}';

export function createGlyphRows(seed: string, intensity: number): string[] {
  const rows: string[] = [];
  let state = Array.from(seed).reduce((acc, char) => acc + char.charCodeAt(0), 41);
  const width = 72;
  const height = 26;

  for (let y = 0; y < height; y += 1) {
    let row = '';
    for (let x = 0; x < width; x += 1) {
      state = (state * 1664525 + 1013904223 + x + y) >>> 0;
      const noise = state / 0xffffffff;
      if (noise > 0.35 + intensity * 0.42) {
        row += ' ';
      } else {
        row += GLYPHS[Math.floor(noise * GLYPHS.length)] ?? '.';
      }
    }
    rows.push(row);
  }

  return rows;
}

export function getGlyphrameCardBackgroundStyle(
  background: GlyphrameBackground
): { background: string } {
  const palette = background.palette;

  if (background.family === 'solid') {
    return { background: palette.background };
  }

  if (background.family === 'mesh') {
    return {
      background: `radial-gradient(circle at 22% 18%, ${palette.accent}66, transparent 34%),
        radial-gradient(circle at 82% 76%, ${palette.foreground}24, transparent 38%),
        linear-gradient(135deg, ${palette.background}, #050605 72%)`
    };
  }

  return {
    background: `linear-gradient(135deg, ${palette.background}, #111615 55%, ${palette.accent}33)`
  };
}
