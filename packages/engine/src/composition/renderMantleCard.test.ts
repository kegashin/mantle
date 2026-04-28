import { createMantleCard } from '@mantle/schemas/defaults';
import type { MantleSurfaceTarget } from '@mantle/schemas/model';
import { describe, expect, it } from 'vitest';

import {
  resolveMantleRenderSize,
  validateMantleRenderBudget
} from './renderMantleCard';

const target = {
  id: 'large',
  kind: 'custom',
  label: 'Large',
  width: 4096,
  height: 4096,
  platform: 'custom'
} satisfies MantleSurfaceTarget;

describe('resolveMantleRenderSize', () => {
  it('allows high-res exports inside the canvas safety envelope', () => {
    expect(resolveMantleRenderSize(target, 2)).toEqual({
      scale: 2,
      width: 8192,
      height: 8192
    });
  });

  it('rejects exports that exceed the canvas safety envelope', () => {
    expect(() => resolveMantleRenderSize(target, 5)).toThrow(
      /too large/
    );
  });

  it('rejects high-res glass exports that exceed the effect memory budget', () => {
    const card = createMantleCard();
    card.frame = {
      ...card.frame,
      boxStyle: 'glass-panel',
      glassBlur: 5
    };

    expect(() => validateMantleRenderBudget(card, 8192, 8192)).toThrow(
      /working canvas memory/
    );
  });
});
