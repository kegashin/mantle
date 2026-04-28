import * as z from 'zod';

import { MantleHexColorSchema } from './palette';
import {
  MANTLE_TEXT_ALIGNMENTS,
  MANTLE_TEXT_FONTS,
  MANTLE_TEXT_PLACEMENTS
} from './model';
export {
  MANTLE_TEXT_ALIGNMENTS,
  MANTLE_TEXT_FONTS,
  MANTLE_TEXT_PLACEMENTS
} from './model';
export type {
  MantleText,
  MantleTextAlignment,
  MantleTextFont,
  MantleTextPlacement
} from './model';

export const MantleTextPlacementSchema = z.enum(MANTLE_TEXT_PLACEMENTS);

export const MantleTextFontSchema = z.enum(MANTLE_TEXT_FONTS);

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
  gap: z.number().int().min(0).max(240)
}).strict();
