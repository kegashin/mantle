import * as z from 'zod';

export const SourceTypeSchema = z.enum(['image', 'gif']);

export const SourceDescriptorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: SourceTypeSchema,
  format: z.string().min(1),
  width: z.number().int().min(0),
  height: z.number().int().min(0),
  fileSize: z.number().int().min(0),
  durationMs: z.number().int().min(0).optional(),
  frameCount: z.number().int().min(0).optional(),
  warnings: z.array(z.string())
});

export type SourceDescriptor = z.infer<typeof SourceDescriptorSchema>;
