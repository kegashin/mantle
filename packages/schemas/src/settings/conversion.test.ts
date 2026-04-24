import { describe, expect, it } from 'vitest';

import {
  ConversionSettingsSchema,
  DEFAULT_CONVERSION_SETTINGS
} from './conversion';

describe('ConversionSettingsSchema', () => {
  it('accepts the default scaffold settings', () => {
    expect(ConversionSettingsSchema.parse(DEFAULT_CONVERSION_SETTINGS)).toEqual(
      DEFAULT_CONVERSION_SETTINGS
    );
  });

  it('accepts the wider manual tuning ranges', () => {
    expect(
      ConversionSettingsSchema.parse({
        ...DEFAULT_CONVERSION_SETTINGS,
        density: 18,
        glyphAspect: 1.2,
        brightness: 150,
        contrast: -150,
        gamma: 6,
        sharpness: 100,
        ditherIntensity: 4,
        detailBoost: 150
      })
    ).toMatchObject({
      density: 18,
      glyphAspect: 1.2,
      brightness: 150,
      contrast: -150,
      gamma: 6,
      sharpness: 100,
      ditherIntensity: 4,
      detailBoost: 150
    });
  });
});
