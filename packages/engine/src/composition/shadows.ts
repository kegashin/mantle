import type { GlyphrameFrame, GlyphramePalette } from '@glyphrame/schemas';

import { isLightPalette, parseHexToRgb, rgbToCss } from './palette';

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

type LegacyShadowSpec = ShadowSettings & {
  id: string;
};

const DEFAULT_SHADOW: ShadowSettings = {
  color: '#000000',
  strength: 1,
  softness: 1,
  distance: 1
};

const LEGACY_SHADOWS: LegacyShadowSpec[] = [
  {
    id: 'soft-float',
    color: '#000000',
    strength: 1,
    softness: 1,
    distance: 1
  },
  {
    id: 'deep-soft',
    color: '#000000',
    strength: 1.25,
    softness: 1.35,
    distance: 1.2
  },
  {
    id: 'paper-float',
    color: '#23180e',
    strength: 0.62,
    softness: 0.95,
    distance: 0.95
  },
  {
    id: 'warm-float',
    color: '#3c1e0a',
    strength: 0.82,
    softness: 1.18,
    distance: 1.1
  },
  {
    id: 'subtle',
    color: '#000000',
    strength: 0.55,
    softness: 0.72,
    distance: 0.7
  }
];

const FALLBACK: LegacyShadowSpec = LEGACY_SHADOWS[0]!;

export const SHADOW_PRESET_IDS = LEGACY_SHADOWS.map((spec) => spec.id);

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function normalizeHexColor(value: string | undefined, fallback: string): string {
  const candidate = value?.trim();
  if (!candidate) return fallback;

  const shortHex = /^#?([0-9a-f]{3})$/i.exec(candidate);
  if (shortHex) {
    return `#${shortHex[1]!
      .split('')
      .map((channel) => `${channel}${channel}`)
      .join('')
      .toLowerCase()}`;
  }

  const fullHex = /^#?([0-9a-f]{6})$/i.exec(candidate);
  if (fullHex) return `#${fullHex[1]!.toLowerCase()}`;

  return fallback;
}

function legacyShadowSettings(id: string | undefined, palette: GlyphramePalette): ShadowSettings {
  const spec = LEGACY_SHADOWS.find((candidate) => candidate.id === id) ?? FALLBACK;

  if (
    isLightPalette(palette) &&
    spec.id !== 'paper-float' &&
    spec.id !== 'warm-float'
  ) {
    return {
      ...spec,
      color: '#281a0c',
      strength: Math.min(spec.strength, 0.62),
      softness: Math.max(spec.softness, 0.95)
    };
  }

  return spec;
}

export function resolveFrameShadowSettings(
  frame: Pick<
    GlyphrameFrame,
    | 'shadowPresetId'
    | 'shadowColor'
    | 'shadowStrength'
    | 'shadowSoftness'
    | 'shadowDistance'
  >,
  palette: GlyphramePalette
): ShadowSettings {
  const hasManualShadow =
    frame.shadowColor != null ||
    frame.shadowStrength != null ||
    frame.shadowSoftness != null ||
    frame.shadowDistance != null;
  const base = hasManualShadow
    ? DEFAULT_SHADOW
    : legacyShadowSettings(frame.shadowPresetId, palette);

  return {
    color: normalizeHexColor(frame.shadowColor, base.color),
    strength: clamp(frame.shadowStrength, 0, 2, base.strength),
    softness: clamp(frame.shadowSoftness, 0, 2.5, base.softness),
    distance: clamp(frame.shadowDistance, 0, 2, base.distance)
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

  return [
    {
      color: rgbToCss(rgb, 0.11 * strength),
      blur: reference * 0.064 * (0.5 + softness * 1.05),
      offsetX: 0,
      offsetY: reference * 0.008 * distance,
      mask: {
        topAlpha: 0.42,
        midAlpha: 0.68,
        bottomAlpha: 0.9
      }
    },
    {
      color: rgbToCss(rgb, 0.15 * strength),
      blur: reference * 0.028 * (0.5 + softness * 0.75),
      offsetX: 0,
      offsetY: reference * 0.022 * distance,
      mask: {
        topAlpha: 0,
        midAlpha: 0.18,
        bottomAlpha: 1
      }
    }
  ];
}

export function applyShadowLayer(
  ctx: CanvasRenderingContext2D,
  layer: ShadowLayer
): void {
  ctx.shadowColor = layer.color;
  ctx.shadowBlur = layer.blur;
  ctx.shadowOffsetX = layer.offsetX;
  ctx.shadowOffsetY = layer.offsetY;
}

export function clearShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}
