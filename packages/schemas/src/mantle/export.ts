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
  quality: z.number().min(0).max(1).optional(),
  gifDurationMs: z.number().int().min(100).max(60000).optional(),
  gifLoop: z.boolean().optional(),
  gifLoopCount: z.number().int().min(0).max(100).optional(),
  videoStartMs: z.number().int().min(0).max(60000).optional(),
  videoEndMs: z.number().int().min(100).max(60000).optional(),
  videoLoop: z.boolean().optional(),
  videoDurationMs: z.number().int().min(100).max(60000).optional(),
  videoFrameRate: z.number().int().min(1).max(60).optional(),
  videoBitrateMbps: z.number().min(0.5).max(40).optional(),
  audioEnabled: z.boolean().optional(),
  animateBackground: z.boolean().optional(),
  fileName: z.string().trim().min(1).max(120).optional()
}).strict();

export const MantleExportResultSchema = z.object({
  blob: z.instanceof(Blob),
  filename: z.string().min(1),
  mimeType: z.string().min(1)
}).strict();
