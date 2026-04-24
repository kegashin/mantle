import * as z from 'zod';

export const DitheringModeSchema = z.enum([
  'off',
  'ordered',
  'floyd-steinberg'
]);
export type DitheringMode = z.infer<typeof DitheringModeSchema>;

export const ColorModeSchema = z.enum(['original', 'monochrome']);
export type ColorMode = z.infer<typeof ColorModeSchema>;

export const ConversionSettingsSchema = z.object({
  preset: z.string().min(1),
  density: z.number().min(1).max(18),
  glyphAspect: z.number().min(0.35).max(1.2),
  charsetPreset: z.string().min(1),
  customCharset: z.string().optional(),
  colorMode: ColorModeSchema,
  brightness: z.number().min(-150).max(150),
  contrast: z.number().min(-150).max(150),
  gamma: z.number().min(0.2).max(6),
  sharpness: z.number().min(0).max(100),
  dithering: DitheringModeSchema,
  ditherIntensity: z.number().min(0).max(4),
  invert: z.boolean(),
  detailBoost: z.number().min(0).max(150),
  foregroundColor: z.string().optional(),
  backgroundColor: z.string().min(1)
});

export type ConversionSettings = z.infer<typeof ConversionSettingsSchema>;

export const DEFAULT_CONVERSION_SETTINGS: ConversionSettings = {
  preset: 'balanced',
  density: 4,
  glyphAspect: 0.55,
  charsetPreset: 'classic',
  colorMode: 'original',
  brightness: 0,
  contrast: 0,
  gamma: 1,
  sharpness: 0,
  dithering: 'ordered',
  ditherIntensity: 1,
  invert: false,
  detailBoost: 0,
  backgroundColor: '#0a0a0c'
};
