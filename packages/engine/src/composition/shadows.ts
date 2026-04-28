import type { MantleFrame, MantlePalette } from '@mantle/schemas/model';

import type { MantleCanvasRenderingContext2D } from './canvas';
import { parseHexToRgb, rgbToCss } from './palette';

export type ShadowSettings = {
  color: string;
  strength: number;
  softness: number;
  distance: number;
};

export type ShadowLayer = {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  mask?: {
    topAlpha: number;
    midAlpha: number;
    bottomAlpha: number;
  } | undefined;
};

const DEFAULT_SHADOW: ShadowSettings = {
  color: '#000000',
  strength: 1,
  softness: 1,
  distance: 1
};

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function resolveFrameShadowSettings(
  frame: Pick<
    MantleFrame,
    'shadowColor' | 'shadowStrength' | 'shadowSoftness' | 'shadowDistance'
  >,
  _palette: MantlePalette
): ShadowSettings {
  return {
    color: frame.shadowColor ?? DEFAULT_SHADOW.color,
    strength: clamp(frame.shadowStrength, 0, 4, DEFAULT_SHADOW.strength),
    softness: clamp(frame.shadowSoftness, 0, 4, DEFAULT_SHADOW.softness),
    distance: clamp(frame.shadowDistance, 0, 4, DEFAULT_SHADOW.distance)
  };
}

export function getShadowLayers(
  settings: ShadowSettings,
  reference: number
): ShadowLayer[] {
  if (settings.strength <= 0) return [];

  const rgb = parseHexToRgb(settings.color);
  const softness = Math.max(0.08, settings.softness);
  const distance = settings.distance;
  const strength = settings.strength;

  // Three-layer drop shadow modelled after physical light:
  //   1. Contact — tight, slightly darker, anchors the card to a surface.
  //   2. Ambient — medium blur, carries the main softness perception.
  //   3. Atmospheric — wide and very soft, gives depth without weight.
  // Each layer has its own vertical mask so shadows fall down (light is
  // assumed to come from above-front), with the contact layer most biased
  // and the atmospheric layer most diffuse.
  return [
    {
      color: rgbToCss(rgb, 0.13 * strength),
      blur: reference * 0.006 * (0.5 + softness * 0.55),
      offsetX: 0,
      offsetY: reference * 0.004 * distance,
      mask: {
        topAlpha: 0.04,
        midAlpha: 0.5,
        bottomAlpha: 1
      }
    },
    {
      color: rgbToCss(rgb, 0.085 * strength),
      blur: reference * 0.022 * (0.5 + softness * 0.85),
      offsetX: 0,
      offsetY: reference * 0.014 * distance,
      mask: {
        topAlpha: 0.18,
        midAlpha: 0.62,
        bottomAlpha: 1
      }
    },
    {
      color: rgbToCss(rgb, 0.05 * strength),
      blur: reference * 0.06 * (0.5 + softness * 1.1),
      offsetX: 0,
      offsetY: reference * 0.022 * distance,
      mask: {
        topAlpha: 0.42,
        midAlpha: 0.78,
        bottomAlpha: 1
      }
    }
  ];
}

export function applyShadowLayer(
  ctx: MantleCanvasRenderingContext2D,
  layer: ShadowLayer
): void {
  ctx.shadowColor = layer.color;
  ctx.shadowBlur = layer.blur;
  ctx.shadowOffsetX = layer.offsetX;
  ctx.shadowOffsetY = layer.offsetY;
}

export function clearShadow(ctx: MantleCanvasRenderingContext2D): void {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}
