import * as z from 'zod';

import { MantleHexColorSchema } from './palette';
import {
  MANTLE_ALIGNMENTS,
  MANTLE_FRAME_BOX_STYLES,
  MANTLE_FRAME_PRESETS
} from './model';
export {
  MANTLE_ALIGNMENTS,
  MANTLE_FRAME_BOX_STYLES,
  MANTLE_FRAME_PRESETS
} from './model';
export type {
  MantleAlignment,
  MantleFrame,
  MantleFrameBoxStyle,
  MantleFramePreset
} from './model';

export const MantleFramePresetSchema = z.enum(MANTLE_FRAME_PRESETS);

export const MantleFrameBoxStyleSchema = z.enum(MANTLE_FRAME_BOX_STYLES);

export const MantleAlignmentSchema = z.enum(MANTLE_ALIGNMENTS);

export const MantleFrameSchema = z.object({
  preset: MantleFramePresetSchema,
  boxStyle: MantleFrameBoxStyleSchema.optional(),
  boxColor: MantleHexColorSchema.optional(),
  boxOpacity: z.number().min(0).max(2).optional(),
  glassBlur: z.number().min(0).max(5).optional(),
  glassOutlineOpacity: z.number().min(0).max(1).optional(),
  chromeText: z.string().optional(),
  padding: z.number().int().min(0).max(480),
  contentPadding: z.number().int().min(0).max(240).optional(),
  cornerRadius: z.number().int().min(0).max(52),
  shadowColor: MantleHexColorSchema.optional(),
  shadowStrength: z.number().min(0).max(4).optional(),
  shadowSoftness: z.number().min(0).max(4).optional(),
  shadowDistance: z.number().min(0).max(4).optional(),
  alignment: MantleAlignmentSchema
}).strict();
