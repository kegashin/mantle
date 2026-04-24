import type { GlyphramePalette } from '@glyphrame/schemas';

export type Rgb = { r: number; g: number; b: number };

export function parseHexToRgb(hex: string, fallback: Rgb = { r: 0, g: 0, b: 0 }): Rgb {
  const cleaned = hex.trim().replace(/^#/, '');
  const expanded =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((ch) => `${ch}${ch}`)
          .join('')
      : cleaned.padEnd(6, '0').slice(0, 6);

  const value = Number.parseInt(expanded, 16);
  if (Number.isNaN(value)) return fallback;

  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff
  };
}

export function rgbToCss({ r, g, b }: Rgb, alpha = 1): string {
  const clampedAlpha = Math.min(1, Math.max(0, alpha));
  if (clampedAlpha >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${clampedAlpha.toFixed(3)})`;
}

/** Perceived luminance in the sRGB 0..1 range. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHexToRgb(hex);
  const toLinear = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  );
}

/** Treat the palette as light when its background's perceived luminance sits above 0.55. */
export function isLightPalette(palette: GlyphramePalette): boolean {
  return relativeLuminance(palette.background) > 0.55;
}

export function mixHex(hex: string, other: string, ratio: number): string {
  const clamped = Math.min(1, Math.max(0, ratio));
  const a = parseHexToRgb(hex);
  const b = parseHexToRgb(other);
  const mix = (from: number, to: number) =>
    Math.round(from + (to - from) * clamped);
  const r = mix(a.r, b.r);
  const g = mix(a.g, b.g);
  const blue = mix(a.b, b.b);
  const toHex = (value: number) => value.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(blue)}`;
}

/** Deterministic PRNG (mulberry32) seeded from a string — lets generators stay reproducible. */
export function createRng(seed: string): () => number {
  let state = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 0x01000193) >>> 0;
  }

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
