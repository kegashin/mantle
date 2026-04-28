import * as z from 'zod';

import { MantleBackgroundSchema } from './background';
import { MantleFrameSchema } from './frame';
import { MantleTextSchema } from './text';
export type { MantleTheme } from './model';

export const MantleThemeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  background: MantleBackgroundSchema,
  frame: MantleFrameSchema,
  text: MantleTextSchema
}).strict();
