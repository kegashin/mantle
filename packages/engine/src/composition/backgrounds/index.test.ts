import { describe, expect, it } from 'vitest';

import {
  isAnimatedBackgroundPresetId,
  isKnownBackgroundPresetId,
  resolveBackgroundGenerator,
  resolveBackgroundPresetDescriptor
} from './index';

describe('background preset registry', () => {
  it('resolves canonical background preset ids', () => {
    expect(resolveBackgroundPresetDescriptor('soft-gradient').id).toBe('soft-gradient');
    expect(resolveBackgroundGenerator('soft-gradient')).toBeTypeOf('function');
  });

  it('marks only expressive procedural presets as animated', () => {
    expect(isAnimatedBackgroundPresetId('smoke-veil')).toBe(true);
    expect(isAnimatedBackgroundPresetId('signal-field')).toBe(true);
    expect(isAnimatedBackgroundPresetId('falling-pattern')).toBe(true);
    expect(isAnimatedBackgroundPresetId('terminal-scanline')).toBe(true);
    expect(isAnimatedBackgroundPresetId('solid-color')).toBe(false);
    expect(isAnimatedBackgroundPresetId('image-fill')).toBe(false);
    expect(isAnimatedBackgroundPresetId('contour-lines')).toBe(false);
  });

  it.each([
    'default',
    'solid',
    'gradient',
    'aurora',
    'ribbon',
    'glyph-wave',
    'composition',
    'signal-rings',
    'neon-rings'
  ])(
    'rejects unsupported shorthand preset alias "%s"',
    (presetId) => {
      expect(isKnownBackgroundPresetId(presetId)).toBe(false);
      expect(() => {
        // @ts-expect-error Exercises runtime validation for stale persisted ids.
        resolveBackgroundPresetDescriptor(presetId);
      }).toThrow(/Unknown Mantle background preset/);
      expect(() => {
        // @ts-expect-error Exercises runtime validation for stale persisted ids.
        resolveBackgroundGenerator(presetId);
      }).toThrow(/Unknown Mantle background preset/);
    }
  );
});
