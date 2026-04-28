import * as z from 'zod';

import {
  MANTLE_SURFACE_ASPECT_RATIO_PRESETS,
  MANTLE_SURFACE_KINDS,
  MANTLE_SURFACE_PLATFORMS
} from './model';
export {
  MANTLE_SURFACE_ASPECT_RATIO_PRESETS,
  MANTLE_SURFACE_KINDS,
  MANTLE_SURFACE_PLATFORMS
} from './model';
export type {
  MantleSafeArea,
  MantleSurfaceAspectRatioPreset,
  MantleSurfaceKind,
  MantleSurfacePlatform,
  MantleSurfaceTarget
} from './model';

export const MantleSurfaceKindSchema = z.enum(MANTLE_SURFACE_KINDS);

export const MantleSurfaceAspectRatioPresetSchema = z.enum(
  MANTLE_SURFACE_ASPECT_RATIO_PRESETS
);

export const MantleSafeAreaSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
}).strict();

export const MantleSurfaceTargetSchema = z.object({
  id: z.string().min(1),
  kind: MantleSurfaceKindSchema,
  label: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  platform: z.enum(MANTLE_SURFACE_PLATFORMS),
  aspectRatioPresetId: MantleSurfaceAspectRatioPresetSchema.optional(),
  safeArea: MantleSafeAreaSchema.optional()
}).strict();
