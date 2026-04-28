import { MANTLE_BACKGROUND_COLOR_PRESET_IDS } from '@mantle/schemas/model';
import type {
  MantleBackground,
  MantleBackgroundPresetId
} from '@mantle/schemas/model';

export const MIN_GRADIENT_COLORS = 2;
export const MAX_GRADIENT_COLORS = 6;
const GRADIENT_COLOR_FALLBACKS = [
  '#10151c',
  '#f1aa6b',
  '#6cc3b4',
  '#8f7af0',
  '#f4d35e',
  '#ff6b8a'
] as const;

export function isColorListBackgroundPreset(
  presetId: MantleBackgroundPresetId
): boolean {
  return MANTLE_BACKGROUND_COLOR_PRESET_IDS.has(presetId);
}

export function getGradientColorsFromBackground(
  background: MantleBackground
): string[] {
  const storedColors = background.colors
    ?.filter(Boolean)
    .slice(0, MAX_GRADIENT_COLORS);
  if (storedColors && storedColors.length >= MIN_GRADIENT_COLORS) return storedColors;

  return [
    background.palette.background,
    background.palette.accent,
    background.palette.muted ?? background.palette.foreground,
    GRADIENT_COLOR_FALLBACKS[3]!
  ];
}

export function createNextGradientColor(colors: readonly string[]): string {
  return (
    GRADIENT_COLOR_FALLBACKS[colors.length] ??
    GRADIENT_COLOR_FALLBACKS[GRADIENT_COLOR_FALLBACKS.length - 1]!
  );
}

export function syncGradientColorsWithPalette(
  background: MantleBackground,
  colors: readonly string[]
): MantleBackground {
  const safeColors = colors.filter(Boolean).slice(0, MAX_GRADIENT_COLORS);
  const [backgroundColor, accentColor, mutedColor] = safeColors;

  if (background.presetId === 'aurora-gradient') {
    return {
      ...background,
      colors: safeColors,
      palette: {
        ...background.palette,
        ...(backgroundColor ? { accent: backgroundColor } : {}),
        ...(accentColor ? { muted: accentColor } : {})
      }
    };
  }

  return {
    ...background,
    colors: safeColors,
    palette: {
      ...background.palette,
      ...(backgroundColor ? { background: backgroundColor } : {}),
      ...(accentColor ? { accent: accentColor } : {}),
      ...(mutedColor ? { muted: mutedColor } : {})
    }
  };
}
