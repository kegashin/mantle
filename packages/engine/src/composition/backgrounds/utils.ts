import type {
  MantleBackgroundParamId,
  MantleBackgroundParams
} from '@mantle/schemas/model';

import type { MantleCanvasRenderingContext2D } from '../canvas';
import type { Rect } from '../types';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function clampRange(value: number, max: number): number {
  return clamp(value, 0, max);
}

export function readBackgroundParam(
  params: MantleBackgroundParams,
  id: MantleBackgroundParamId,
  fallback: number,
  max = 1
): number {
  return clamp(params[id] ?? fallback, 0, max);
}

export function resolveProvidedBackgroundColors(
  colors: readonly string[] | undefined
): string[] | undefined {
  const provided = colors?.filter(Boolean).slice(0, 6);
  return provided && provided.length >= 2 ? provided : undefined;
}

export function drawPixelGrain({
  ctx,
  rect,
  rng,
  count,
  fillStyle,
  scale,
  minSize = 0.55,
  sizeBase = 0.45,
  sizeJitter = 0.85
}: {
  ctx: MantleCanvasRenderingContext2D;
  rect: Rect;
  rng: () => number;
  count: number;
  fillStyle: string;
  scale: number;
  minSize?: number;
  sizeBase?: number;
  sizeJitter?: number;
}): void {
  ctx.save();
  ctx.fillStyle = fillStyle;
  for (let i = 0; i < count; i += 1) {
    const x = rect.x + rng() * rect.width;
    const y = rect.y + rng() * rect.height;
    const size = Math.max(minSize, scale * (sizeBase + rng() * sizeJitter));
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}
