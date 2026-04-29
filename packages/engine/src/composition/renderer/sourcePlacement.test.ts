import { describe, expect, it } from 'vitest';

import {
  resolveCoverSourceCrop,
  resolveSourceCropForContent,
  resolveSourceImageDrawPlan
} from './sourcePlacement';

describe('source placement', () => {
  it('centers a cover crop for wider source images', () => {
    expect(
      resolveCoverSourceCrop({
        sourceWidth: 2000,
        sourceHeight: 1000,
        destinationWidth: 1000,
        destinationHeight: 1000
      })
    ).toEqual({
      x: 0.25,
      y: 0,
      width: 0.5,
      height: 1
    });
  });

  it('keeps fit mode inside the content rect without source cropping', () => {
    const plan = resolveSourceImageDrawPlan({
      placement: { mode: 'fit' },
      sourceWidth: 1600,
      sourceHeight: 900,
      contentRect: { x: 100, y: 100, width: 800, height: 800 }
    });

    expect(plan.sourceRect).toEqual({ x: 0, y: 0, width: 1600, height: 900 });
    expect(plan.destinationRect).toEqual({
      x: 100,
      y: 275,
      width: 800,
      height: 450
    });
  });

  it('keeps manual crops proportional when the content ratio changes', () => {
    const plan = resolveSourceImageDrawPlan({
      placement: {
        mode: 'crop',
        crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 }
      },
      sourceWidth: 2000,
      sourceHeight: 1000,
      contentRect: { x: 40, y: 50, width: 600, height: 300 }
    });

    expect(plan.sourceRect.x).toBeCloseTo(200);
    expect(plan.sourceRect.y).toBeCloseTo(150);
    expect(plan.sourceRect.width).toBeCloseTo(1000);
    expect(plan.sourceRect.height).toBeCloseTo(500);
    expect(plan.destinationRect).toEqual({
      x: 40,
      y: 50,
      width: 600,
      height: 300
    });
  });

  it('recomputes focus and zoom crops for a resized frame viewport', () => {
    const squareCrop = resolveSourceCropForContent({
      placement: {
        mode: 'crop',
        focus: { x: 0.5, y: 0.5 },
        zoom: 2
      },
      sourceWidth: 2000,
      sourceHeight: 1000,
      destinationWidth: 500,
      destinationHeight: 500
    });
    const wideCrop = resolveSourceCropForContent({
      placement: {
        mode: 'crop',
        focus: { x: 0.5, y: 0.5 },
        zoom: 2
      },
      sourceWidth: 2000,
      sourceHeight: 1000,
      destinationWidth: 1000,
      destinationHeight: 500
    });

    expect(squareCrop).toEqual({
      x: 0.375,
      y: 0.25,
      width: 0.25,
      height: 0.5
    });
    expect(wideCrop).toEqual({
      x: 0.25,
      y: 0.25,
      width: 0.5,
      height: 0.5
    });
  });
});
