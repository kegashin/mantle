import { describe, expect, it } from 'vitest';

import { DEFAULT_CONVERSION_SETTINGS } from '@glyphrame/schemas';

import { applyPreset } from './conversionPresets';

describe('applyPreset', () => {
  it('resets inherited terminal colors when switching to punchy', () => {
    const terminal = applyPreset('terminal', DEFAULT_CONVERSION_SETTINGS);
    const punchy = applyPreset('punchy', terminal);

    expect(punchy.preset).toBe('punchy');
    expect(punchy.colorMode).toBe('original');
    expect(punchy.backgroundColor).toBe(DEFAULT_CONVERSION_SETTINGS.backgroundColor);
    expect(punchy.foregroundColor).toBeUndefined();
    expect(punchy.dithering).toBe('floyd-steinberg');
  });

  it('returns a stable dense preset regardless of current custom settings', () => {
    const dense = applyPreset('dense', {
      ...DEFAULT_CONVERSION_SETTINGS,
      customCharset: 'abc',
      colorMode: 'monochrome',
      foregroundColor: '#ffffff',
      backgroundColor: '#101010'
    });

    expect(dense.preset).toBe('dense');
    expect(dense.charsetPreset).toBe('dense');
    expect(dense.customCharset).toBeUndefined();
    expect(dense.colorMode).toBe('original');
    expect(dense.backgroundColor).toBe(DEFAULT_CONVERSION_SETTINGS.backgroundColor);
  });
});
