import { describe, expect, it } from 'vitest';

import type { MantleFrame } from '@mantle/schemas/model';

import {
  CSS_GLASS_FRAME_DEFAULTS,
  resolveGlassFrameMaterial
} from './frameMaterial';

const baseFrame: MantleFrame = {
  preset: 'minimal-browser',
  boxStyle: 'solid',
  padding: 96,
  contentPadding: 0,
  cornerRadius: 24,
  shadowColor: '#000000',
  shadowStrength: 1,
  shadowSoftness: 1,
  shadowDistance: 1,
  alignment: 'center'
};

describe('frame material helpers', () => {
  it('uses CSS glass defaults when switching into glass from another material', () => {
    expect(resolveGlassFrameMaterial(baseFrame)).toEqual(CSS_GLASS_FRAME_DEFAULTS);
  });

  it('preserves existing glass material values', () => {
    expect(
      resolveGlassFrameMaterial({
        ...baseFrame,
        boxStyle: 'glass-panel',
        boxColor: '#fafafa',
        boxOpacity: 0.42,
        glassBlur: 3,
        glassOutlineOpacity: 0.17
      })
    ).toEqual({
      boxColor: '#fafafa',
      boxOpacity: 0.42,
      glassBlur: 3,
      glassOutlineOpacity: 0.17
    });
  });
});
