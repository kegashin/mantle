import { describe, expect, it } from 'vitest';

import {
  applyFrameTransformToRect,
  resolveFrameTransform
} from './frameTransform';

describe('resolveFrameTransform', () => {
  it('clamps transform values to the supported editor range', () => {
    expect(
      resolveFrameTransform({
        x: 2,
        y: -2,
        scaleX: 8,
        scaleY: 0.1,
        rotation: 240
      })
    ).toEqual({
      x: 1,
      y: -1,
      scaleX: 2.5,
      scaleY: 0.35,
      rotation: 180
    });
  });
});

describe('applyFrameTransformToRect', () => {
  it('scales each axis around the frame center and translates in canvas fractions', () => {
    expect(
      applyFrameTransformToRect({
        rect: { x: 200, y: 100, width: 800, height: 400 },
        canvas: { x: 0, y: 0, width: 1600, height: 900 },
        transform: { x: 0.1, y: -0.2, scaleX: 1.5, scaleY: 0.75, rotation: 0 }
      })
    ).toEqual({
      x: 160,
      y: 0,
      width: 1200,
      height: 300
    });
  });

  it('keeps oversized transforms inside the canvas bounds', () => {
    const rect = applyFrameTransformToRect({
      rect: { x: 200, y: 100, width: 800, height: 400 },
      canvas: { x: 0, y: 0, width: 1600, height: 900 },
      transform: { x: 0.6, y: 0.5, scaleX: 2.5, scaleY: 2.5, rotation: 0 }
    });

    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1600);
    expect(rect.y + rect.height).toBeLessThanOrEqual(900);
  });
});
