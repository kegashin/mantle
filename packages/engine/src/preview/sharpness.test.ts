import { describe, expect, it } from 'vitest';

import { applySharpnessToLuminance, getSharpnessFactor } from './sharpness';

describe('applySharpnessToLuminance', () => {
  it('keeps flat luminance fields unchanged', () => {
    expect(applySharpnessToLuminance([0.5, 0.5, 0.5, 0.5], 2, 2, 80)).toEqual([
      0.5, 0.5, 0.5, 0.5
    ]);
  });

  it('increases local contrast around brighter cells', () => {
    const values = [
      0.2, 0.2, 0.2,
      0.2, 0.7, 0.2,
      0.2, 0.2, 0.2
    ];
    const sharpened = applySharpnessToLuminance(values, 3, 3, 100);

    expect(sharpened[4]).toBeGreaterThan(values[4] ?? 0);
    expect(sharpened[1]).toBeLessThan(values[1] ?? 1);
  });

  it('returns the original array reference when sharpness is disabled', () => {
    const values = [0.1, 0.4, 0.7];

    expect(applySharpnessToLuminance(values, 3, 1, 0)).toBe(values);
  });

  it('uses a stronger mid-range response than a linear mapping', () => {
    expect(getSharpnessFactor(50)).toBeGreaterThan(2.4);
  });
});
