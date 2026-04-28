import { describe, expect, it } from 'vitest';

import {
  isKnownBackgroundPresetId,
  resolveBackgroundGenerator,
  resolveBackgroundPresetDescriptor
} from './index';

describe('background preset registry', () => {
  it('resolves canonical background preset ids', () => {
    expect(resolveBackgroundPresetDescriptor('soft-gradient').id).toBe('soft-gradient');
    expect(resolveBackgroundGenerator('soft-gradient')).toBeTypeOf('function');
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
