import * as z from 'zod';

import { MantleHexColorSchema } from './palette';
import {
  MANTLE_TEXT_ALIGNMENTS,
  MANTLE_TEXT_FONTS,
  MANTLE_TEXT_PLACEMENTS,
  MANTLE_TEXT_SHADOWS
} from './model';
export {
  MANTLE_TEXT_ALIGNMENTS,
  MANTLE_TEXT_FONTS,
  MANTLE_TEXT_PLACEMENTS,
  MANTLE_TEXT_SHADOWS
} from './model';
export type {
  MantleText,
  MantleTextAlignment,
  MantleTextFont,
  MantleTextLayer,
  MantleTextPlacement,
  MantleTextShadow
} from './model';

export const MantleTextPlacementSchema = z.enum(MANTLE_TEXT_PLACEMENTS);

export const MantleTextFontSchema = z.enum(MANTLE_TEXT_FONTS);

export const MantleTextShadowSchema = z.enum(MANTLE_TEXT_SHADOWS);

export const MantleTextTransformSchema = z.object({
  x: z.number().min(-1).max(2),
  y: z.number().min(-1).max(2),
  rotation: z.number().min(-180).max(180)
}).strict();

export const MantleTextSchema = z.object({
  placement: MantleTextPlacementSchema,
  align: z.enum(MANTLE_TEXT_ALIGNMENTS),
  titleFont: MantleTextFontSchema,
  subtitleFont: MantleTextFontSchema,
  titleColor: MantleHexColorSchema.optional(),
  subtitleColor: MantleHexColorSchema.optional(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  scale: z.number().min(0.5).max(2),
  width: z.number().min(0.08).max(1),
  gap: z.number().int().min(0).max(240),
  shadow: MantleTextShadowSchema.default('auto'),
  transform: MantleTextTransformSchema.optional()
}).strict();

export const MantleTextLayerSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  font: MantleTextFontSchema,
  align: z.enum(MANTLE_TEXT_ALIGNMENTS),
  color: MantleHexColorSchema.optional(),
  scale: z.number().min(0.5).max(2),
  width: z.number().min(0.08).max(1),
  shadow: MantleTextShadowSchema.default('auto'),
  transform: MantleTextTransformSchema
}).strict();
