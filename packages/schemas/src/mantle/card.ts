import * as z from 'zod';

import { MantleBackgroundSchema } from './background';
import { MantleExportSettingsSchema } from './export';
import { MantleFrameSchema } from './frame';
import { MantleTextSchema } from './text';
export type { MantleCard } from './model';

export const MantleCardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  targetId: z.string().min(1),
  sourceAssetId: z.string().min(1).optional(),
  templateId: z.string().min(1),
  themeId: z.string().min(1),
  background: MantleBackgroundSchema,
  frame: MantleFrameSchema,
  text: MantleTextSchema,
  export: MantleExportSettingsSchema
}).strict();
