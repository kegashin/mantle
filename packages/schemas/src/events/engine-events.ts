import * as z from 'zod';

import { ExportFormatSchema, ExportResultSchema } from '../export/options';
import { SourceDescriptorSchema } from '../source/descriptor';

export const EngineEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('warning'),
    message: z.string().min(1)
  }),
  z.object({
    type: z.literal('source-loaded'),
    source: SourceDescriptorSchema
  }),
  z.object({
    type: z.literal('preview-updated')
  }),
  z.object({
    type: z.literal('export-started'),
    format: ExportFormatSchema
  }),
  z.object({
    type: z.literal('export-progress'),
    progress: z.number().min(0).max(1)
  }),
  z.object({
    type: z.literal('export-finished'),
    result: ExportResultSchema
  }),
  z.object({
    type: z.literal('error'),
    message: z.string().min(1),
    recoverable: z.boolean()
  })
]);

export type EngineEvent = z.infer<typeof EngineEventSchema>;
