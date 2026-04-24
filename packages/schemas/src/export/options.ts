import * as z from 'zod';

export const ExportFormatSchema = z.enum(['png', 'jpeg', 'webp', 'gif', 'txt']);

export const ExportOptionsSchema = z.object({
  format: ExportFormatSchema,
  scale: z.union([z.literal(1), z.literal(2), z.literal(4)]),
  quality: z.number().min(0).max(1).optional()
});

export const ExportResultSchema = z.object({
  blob: z.instanceof(Blob),
  filename: z.string().min(1),
  mimeType: z.string().min(1)
});

export type ExportFormat = z.infer<typeof ExportFormatSchema>;
export type ExportOptions = z.infer<typeof ExportOptionsSchema>;
export type ExportResult = z.infer<typeof ExportResultSchema>;
