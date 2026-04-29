import * as z from 'zod';

import { MantleBackgroundSchema } from './background';
import { MantleExportSettingsSchema } from './export';
import { MantleFrameSchema } from './frame';
import { MantleTextSchema } from './text';
import { MANTLE_SOURCE_PLACEMENT_MODES } from './model';
export {
  MANTLE_SOURCE_PLACEMENT_MODES
} from './model';
export type {
  MantleCard,
  MantleFrameTransform,
  MantleSourceCrop,
  MantleSourceFocus,
  MantleSourcePlacement,
  MantleSourcePlacementMode
} from './model';

export const MantleSourcePlacementModeSchema = z.enum(
  MANTLE_SOURCE_PLACEMENT_MODES
);

export const MantleSourceCropSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.01).max(1),
  height: z.number().min(0.01).max(1)
}).strict().superRefine((crop, ctx) => {
  if (crop.x + crop.width > 1.000001) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['width'],
      message: 'Source crop must stay inside the image width.'
    });
  }

  if (crop.y + crop.height > 1.000001) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['height'],
      message: 'Source crop must stay inside the image height.'
    });
  }
});

export const MantleSourceFocusSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1)
}).strict();

export const MantleSourcePlacementSchema = z.object({
  mode: MantleSourcePlacementModeSchema,
  crop: MantleSourceCropSchema.optional(),
  focus: MantleSourceFocusSchema.optional(),
  zoom: z.number().min(1).max(4).optional()
}).strict().superRefine((placement, ctx) => {
  const hasFocusZoom = Boolean(placement.focus && placement.zoom != null);

  if (placement.mode === 'crop' && !placement.crop && !hasFocusZoom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['crop'],
      message: 'Manual source placement requires crop or focus and zoom.'
    });
  }
});

export const MantleFrameTransformSchema = z.object({
  x: z.number().min(-1).max(1),
  y: z.number().min(-1).max(1),
  scaleX: z.number().min(0.35).max(2.5),
  scaleY: z.number().min(0.35).max(2.5),
  rotation: z.number().min(-180).max(180)
}).strict();

export const MantleCardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  targetId: z.string().min(1),
  sourceAssetId: z.string().min(1).optional(),
  templateId: z.string().min(1),
  themeId: z.string().min(1),
  background: MantleBackgroundSchema,
  sourcePlacement: MantleSourcePlacementSchema.optional(),
  frameTransform: MantleFrameTransformSchema.optional(),
  frame: MantleFrameSchema,
  text: MantleTextSchema,
  export: MantleExportSettingsSchema
}).strict();
