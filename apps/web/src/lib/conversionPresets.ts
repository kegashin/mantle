import {
  DEFAULT_CONVERSION_SETTINGS,
  type ConversionSettings,
  type PreviewMode
} from '@glyphrame/schemas';

export const PRESET_OPTIONS = [
  { label: 'Balanced', value: 'balanced' },
  { label: 'Punchy', value: 'punchy' },
  { label: 'Dense', value: 'dense' },
  { label: 'Terminal', value: 'terminal' }
] as const;

export const CHARSET_OPTIONS = [
  { label: 'Classic', value: 'classic' },
  { label: 'Blocks', value: 'blocks' },
  { label: 'Minimal', value: 'minimal' },
  { label: 'Dense', value: 'dense' },
  { label: 'Custom', value: 'custom' }
] as const;

export const DITHERING_OPTIONS = [
  { label: 'Off', value: 'off' },
  { label: 'Ordered', value: 'ordered' },
  { label: 'Floyd-Steinberg', value: 'floyd-steinberg' }
] as const;

export const COLOR_MODE_OPTIONS = [
  { label: 'Original', value: 'original' },
  { label: 'Monochrome', value: 'monochrome' }
] as const;

export const PREVIEW_MODE_OPTIONS: Array<{
  label: string;
  value: PreviewMode;
}> = [
  { label: 'Original', value: 'original' },
  { label: 'Split', value: 'split' },
  { label: 'ASCII', value: 'final' }
];

export function applyPreset(
  preset: string,
  current: ConversionSettings
): ConversionSettings {
  const base: ConversionSettings = {
    ...DEFAULT_CONVERSION_SETTINGS,
    customCharset: undefined,
    foregroundColor: undefined
  };

  switch (preset) {
    case 'punchy':
      return {
        ...base,
        preset,
        density: 5,
        glyphAspect: 0.58,
        charsetPreset: 'classic',
        colorMode: 'original',
        contrast: 22,
        gamma: 0.92,
        detailBoost: 18,
        dithering: 'floyd-steinberg',
        ditherIntensity: 1.15
      };
    case 'dense':
      return {
        ...base,
        preset,
        density: 6,
        glyphAspect: 0.6,
        charsetPreset: 'dense',
        colorMode: 'original',
        contrast: 8,
        detailBoost: 10,
        dithering: 'ordered',
        ditherIntensity: 0.9
      };
    case 'terminal':
      return {
        ...base,
        preset,
        density: 4,
        glyphAspect: 0.5,
        charsetPreset: 'classic',
        colorMode: 'monochrome',
        contrast: 14,
        detailBoost: 8,
        dithering: 'off',
        ditherIntensity: 0,
        // "Terminal" is an intentionally themed preset — a phosphor-green
        // CRT look — not the app-wide monochrome default.
        foregroundColor: '#a8f0b0',
        backgroundColor: '#061b0c'
      };
    case 'balanced':
    default:
      return {
        ...base,
        preset,
        foregroundColor: current.colorMode === 'monochrome' ? current.foregroundColor : undefined
      };
  }
}
