import * as z from 'zod';

import { MANTLE_HEX_COLOR_PATTERN } from './model';
export { MANTLE_HEX_COLOR_PATTERN } from './model';
export type { MantleHexColor, MantlePalette } from './model';

export const MantleHexColorSchema = z.string().regex(
  MANTLE_HEX_COLOR_PATTERN,
  'Expected a #RGB or #RRGGBB hex color.'
);

export const MantlePaletteSchema = z.object({
  background: MantleHexColorSchema,
  foreground: MantleHexColorSchema,
  accent: MantleHexColorSchema,
  muted: MantleHexColorSchema.optional()
}).strict();
