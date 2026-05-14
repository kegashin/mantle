import * as z from 'zod';

import {
  MantleHexColorSchema,
  MantlePaletteSchema
} from './palette';
import {
  MANTLE_BACKGROUND_COLOR_PRESET_IDS,
  MANTLE_BACKGROUND_ANIMATION_SPEED_MAX,
  MANTLE_BACKGROUND_ANIMATION_SPEED_MIN,
  MANTLE_BACKGROUND_FAMILIES,
  MANTLE_BACKGROUND_PARAM_IDS,
  MANTLE_BACKGROUND_PRESET_FAMILY,
  MANTLE_BACKGROUND_PRESET_IDS
} from './model';
import type {
  MantleBackgroundParamId,
  MantleBackgroundPresetId
} from './model';
export {
  MANTLE_BACKGROUND_ANIMATION_SPEED_DEFAULT,
  MANTLE_BACKGROUND_ANIMATION_SPEED_MAX,
  MANTLE_BACKGROUND_ANIMATION_SPEED_MIN,
  MANTLE_BACKGROUND_COLOR_PRESET_IDS,
  MANTLE_BACKGROUND_FAMILIES,
  MANTLE_BACKGROUND_PARAM_IDS,
  MANTLE_BACKGROUND_PRESET_FAMILY,
  MANTLE_BACKGROUND_PRESET_IDS
} from './model';
export type {
  MantleBackground,
  MantleBackgroundAnimation,
  MantleBackgroundFamily,
  MantleBackgroundParamId,
  MantleBackgroundParams,
  MantleBackgroundPresetId
} from './model';

export const MantleBackgroundFamilySchema = z.enum(MANTLE_BACKGROUND_FAMILIES);

export const MantleBackgroundPresetIdSchema = z.enum(
  MANTLE_BACKGROUND_PRESET_IDS
);

export const MantleBackgroundParamIdSchema = z.enum(
  MANTLE_BACKGROUND_PARAM_IDS
);

export const MantleBackgroundAnimationSchema = z.object({
  speed: z
    .number()
    .min(MANTLE_BACKGROUND_ANIMATION_SPEED_MIN)
    .max(MANTLE_BACKGROUND_ANIMATION_SPEED_MAX)
    .optional()
}).strict();

const MANTLE_BACKGROUND_PARAM_MAX: Record<
  MantleBackgroundPresetId,
  Partial<Record<MantleBackgroundParamId, number>>
> = {
  'solid-color': {},
  'image-fill': {},
  'soft-gradient': {
    angle: 1,
    spread: 1,
    glow: 1,
    grain: 1
  },
  'aurora-gradient': {
    glow: 4,
    spread: 3,
    grain: 1
  },
  'marbling': {
    complexity: 2,
    sharpness: 2,
    curve: 4,
    grain: 2
  },
  'signal-field': {
    lineDensity: 1,
    thickness: 1,
    glow: 1
  },
  'symbol-wave': {
    glyphAmount: 1,
    waveHeight: 1,
    glow: 1
  },
  'falling-pattern': {
    glyphDensity: 1,
    sweepGlow: 1,
    glow: 1
  },
  'smoke-veil': {
    details: 1,
    glow: 1,
    grain: 1
  },
  'terminal-scanline': {
    scanlineDensity: 1,
    glyphDensity: 1,
    sweepGlow: 1
  },
  'contour-lines': {
    lineDensity: 1,
    relief: 1,
    accentGlow: 1
  },
  'dot-grid': {
    dotOpacity: 2,
    dotSize: 1,
    dotDensity: 1
  }
};

export const MantleBackgroundSchema = z.object({
  family: MantleBackgroundFamilySchema,
  presetId: MantleBackgroundPresetIdSchema,
  seed: z.string().min(1),
  intensity: z.number().min(0).max(1),
  params: z
    .partialRecord(MantleBackgroundParamIdSchema, z.number().min(0).max(4))
    .optional(),
  animation: MantleBackgroundAnimationSchema.optional(),
  palette: MantlePaletteSchema,
  colors: z.array(MantleHexColorSchema).min(2).max(6).optional(),
  imageAssetId: z.string().min(1).optional()
}).strict().superRefine((background, ctx) => {
  const expectedFamily = MANTLE_BACKGROUND_PRESET_FAMILY[background.presetId];
  if (background.family !== expectedFamily) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['family'],
      message: `Background family "${background.family}" does not match preset "${background.presetId}". Expected "${expectedFamily}".`
    });
  }

  if (
    background.colors &&
    !MANTLE_BACKGROUND_COLOR_PRESET_IDS.has(background.presetId)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['colors'],
      message: `Background colors are only supported by color-list presets.`
    });
  }

  if (background.presetId === 'image-fill' && !background.imageAssetId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['imageAssetId'],
      message: `Background preset "image-fill" requires imageAssetId.`
    });
  }

  if (background.presetId !== 'image-fill' && background.imageAssetId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['imageAssetId'],
      message: `Background imageAssetId is only supported by "image-fill".`
    });
  }

  const paramMax = MANTLE_BACKGROUND_PARAM_MAX[background.presetId] ?? {};
  MANTLE_BACKGROUND_PARAM_IDS.forEach((paramId) => {
    const value = background.params?.[paramId];
    if (value == null) return;

    const maxValue = paramMax[paramId];
    if (maxValue == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['params', paramId],
        message: `Background param "${paramId}" is not supported by preset "${background.presetId}".`
      });
      return;
    }
    if (value > maxValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['params', paramId],
        message: `Background param "${paramId}" must be less than or equal to ${maxValue}.`
      });
    }
  });
});
