import * as z from 'zod';

import { MantlePaletteSchema } from './palette';
export type { MantleBrand } from './model';

export const MantleBrandSchema = z.object({
  name: z.string().min(1),
  website: z.string().optional(),
  palette: MantlePaletteSchema,
  fontFamily: z.string().min(1).optional(),
  logoAssetId: z.string().min(1).optional()
}).strict();
