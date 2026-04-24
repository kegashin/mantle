import * as z from 'zod';

export const AnimationSamplingModeSchema = z.enum([
  'preserve',
  '12fps',
  '15fps',
  '24fps'
]);

export const AnimationSettingsSchema = z.object({
  samplingMode: AnimationSamplingModeSchema
});

export type AnimationSettings = z.infer<typeof AnimationSettingsSchema>;

export const DEFAULT_ANIMATION_SETTINGS: AnimationSettings = {
  samplingMode: 'preserve'
};
