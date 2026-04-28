import { describe, expect, it } from 'vitest';

import type { MantleBackground } from '@mantle/schemas/model';

import {
  MAX_GRADIENT_COLORS,
  createNextGradientColor,
  getGradientColorsFromBackground,
  isColorListBackgroundPreset,
  syncGradientColorsWithPalette
} from './backgroundColors';

const baseBackground: MantleBackground = {
  family: 'gradient',
  presetId: 'soft-gradient',
  seed: 'test',
  intensity: 1,
  params: {},
  palette: {
    background: '#111111',
    foreground: '#eeeeee',
    accent: '#222222',
    muted: '#333333'
  }
};

describe('background color helpers', () => {
  it('reads stored gradient colors when there are enough values', () => {
    const colors = getGradientColorsFromBackground({
      ...baseBackground,
      colors: [
        '#000001',
        '#000002',
        '#000003',
        '#000004',
        '#000005',
        '#000006',
        '#000007'
      ]
    });

    expect(colors).toEqual([
      '#000001',
      '#000002',
      '#000003',
      '#000004',
      '#000005',
      '#000006'
    ]);
  });

  it('falls back to palette colors when stored colors are missing', () => {
    expect(getGradientColorsFromBackground(baseBackground)).toEqual([
      '#111111',
      '#222222',
      '#333333',
      '#8f7af0'
    ]);
  });

  it('syncs soft gradient colors back to background, accent, and muted palette slots', () => {
    const next = syncGradientColorsWithPalette(baseBackground, [
      '#010101',
      '#020202',
      '#030303'
    ]);

    expect(next.colors).toEqual(['#010101', '#020202', '#030303']);
    expect(next.palette).toMatchObject({
      background: '#010101',
      accent: '#020202',
      muted: '#030303'
    });
  });

  it('syncs aurora gradient colors to accent and muted without replacing the base background', () => {
    const next = syncGradientColorsWithPalette(
      {
        ...baseBackground,
        presetId: 'aurora-gradient'
      },
      ['#010101', '#020202', '#030303']
    );

    expect(next.colors).toEqual(['#010101', '#020202', '#030303']);
    expect(next.palette).toMatchObject({
      background: '#111111',
      accent: '#010101',
      muted: '#020202'
    });
  });

  it('uses capped fallback colors for adding gradient stops', () => {
    expect(createNextGradientColor(['#1', '#2'])).toBe('#6cc3b4');
    expect(createNextGradientColor(Array.from({ length: MAX_GRADIENT_COLORS }))).toBe(
      '#ff6b8a'
    );
  });

  it('identifies presets that use editable color lists', () => {
    expect(isColorListBackgroundPreset('soft-gradient')).toBe(true);
    expect(isColorListBackgroundPreset('solid-color')).toBe(false);
  });
});
