import * as z from 'zod';

export const PreviewModeSchema = z.enum(['final', 'split', 'original']);
export const ZoomModeSchema = z.enum(['fit', '100']);
export type PreviewMode = z.infer<typeof PreviewModeSchema>;
export type ZoomMode = z.infer<typeof ZoomModeSchema>;

export const PreviewStateSchema = z.object({
  mode: PreviewModeSchema,
  zoom: ZoomModeSchema,
  isPlaying: z.boolean(),
  currentTimeMs: z.number().min(0).optional()
});

export type PreviewState = z.infer<typeof PreviewStateSchema>;

export const DEFAULT_PREVIEW_STATE: PreviewState = {
  mode: 'split',
  zoom: 'fit',
  isPlaying: true,
  currentTimeMs: 0
};
