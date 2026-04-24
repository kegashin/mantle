import type { GlyphramePalette } from '@glyphrame/schemas';

import type { Rect } from '../types';

export type { Rect } from '../types';

export type BackgroundGeneratorInput = {
  ctx: CanvasRenderingContext2D;
  rect: Rect;
  palette: GlyphramePalette;
  intensity: number;
  params: Record<string, number>;
  seed: string;
  /** Draw-space scale factor relative to the nominal 1600-wide target. */
  scale: number;
};

export type BackgroundGenerator = (input: BackgroundGeneratorInput) => void;
