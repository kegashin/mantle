import * as z from 'zod';

import { MANTLE_EXPORT_FORMATS } from './model';
export { MANTLE_EXPORT_FORMATS } from './model';
export type {
  ExportResult,
  MantleExportFormat,
  MantleExportSettings
} from './model';

export const MantleExportFormatSchema = z.enum(MANTLE_EXPORT_FORMATS);

export const MantleExportSettingsSchema = z.object({
  format: MantleExportFormatSchema,
  scale: z.number().min(1).max(5),
  quality: z.number().min(0).max(1).optional()
}).strict();

export const MantleExportResultSchema = z.object({
  blob: z.instanceof(Blob),
  filename: z.string().min(1),
  mimeType: z.string().min(1)
}).strict();
