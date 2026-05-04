import { getBackgroundPresetDefaultParams } from '@mantle/engine/catalog';
import { DEFAULT_MANTLE_TEXT } from '@mantle/schemas/defaults';
import {
  MANTLE_BACKGROUND_PRESET_FAMILY,
  type MantleBackground,
  type MantleBackgroundParamId,
  type MantleBackgroundParams,
  type MantleBackgroundPresetId,
  type MantleFrame,
  type MantleText,
  type MantleTheme
} from '@mantle/schemas/model';

import {
  getGradientColorsFromBackground,
  syncGradientColorsWithPalette
} from '../lib/backgroundColors';

export type StylePreset = {
  id: string;
  label: string;
  hint: string;
  background: MantleBackground;
  frame: MantleFrame;
  text: MantleText;
};

type StyleGroup = {
  label: string;
  presetIds: string[];
};

export const IMAGE_BACKGROUND_STYLE_ID = 'image-background';

export const STYLE_GROUPS: StyleGroup[] = [
  {
    label: 'Quiet',
    presetIds: ['default-solid', 'dot-grid']
  },
  {
    label: 'Media',
    presetIds: [IMAGE_BACKGROUND_STYLE_ID]
  },
  {
    label: 'Gradient',
    presetIds: ['soft-gradient', 'aurora-gradient', 'marbling', 'smoke-veil']
  },
  {
    label: 'Glyph',
    presetIds: ['symbol-wave', 'terminal-scanline', 'falling-pattern']
  },
  {
    label: 'Pattern',
    presetIds: ['signal-field', 'contour-lines']
  }
];

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'default-solid',
    label: 'Default',
    hint: 'Studio paper · soft accent wash',
    background: {
      family: 'solid',
      presetId: 'solid-color',
      seed: 'default-solid',
      intensity: 0.5,
      params: {},
      palette: {
        background: '#0d0e12',
        foreground: '#f4f1e6',
        accent: '#c9b794',
        muted: '#5a5d62'
      }
    },
    frame: {
      preset: 'minimal-browser',
      boxStyle: 'solid',
      padding: 108,
      contentPadding: 0,
      cornerRadius: 22,
      shadowColor: '#0d0e12',
      shadowStrength: 0.95,
      shadowSoftness: 1.05,
      shadowDistance: 1,
      alignment: 'center'
    },
    text: DEFAULT_MANTLE_TEXT
  },
  {
    id: 'soft-gradient',
    label: 'Linear Gradient',
    hint: 'Editorial sunset · plum to cream',
    background: {
      family: 'gradient',
      presetId: 'soft-gradient',
      seed: 'soft-gradient',
      intensity: 0.78,
      params: {
        angle: 0.62,
        spread: 0.66,
        glow: 0.55,
        grain: 0.06
      },
      colors: ['#15090f', '#b6385a', '#f0795a', '#fde4b5'],
      palette: {
        background: '#15090f',
        foreground: '#fbf2e6',
        accent: '#f0795a',
        muted: '#b6385a'
      }
    },
    frame: {
      preset: 'minimal-browser',
      boxStyle: 'solid',
      padding: 112,
      contentPadding: 0,
      cornerRadius: 22,
      shadowColor: '#15090f',
      shadowStrength: 1.05,
      shadowSoftness: 1.18,
      shadowDistance: 1,
      alignment: 'center'
    },
    text: DEFAULT_MANTLE_TEXT
  },
  {
    id: 'aurora-gradient',
    label: 'Aurora Gradient',
    hint: 'Northern sky · emerald and dusk',
    background: {
      family: 'gradient',
      presetId: 'aurora-gradient',
      seed: 'aurora-gradient',
      intensity: 0.82,
      params: {
        glow: 2.6,
        spread: 1.05,
        grain: 0.05
      },
      colors: ['#0c1626', '#3aa07c', '#7ad6c4', '#a78dc6'],
      palette: {
        background: '#06080f',
        foreground: '#f4f6ff',
        accent: '#7ad6c4',
        muted: '#3aa07c'
      }
    },
    frame: {
      preset: 'minimal-browser',
      boxStyle: 'glass-panel',
      boxColor: '#ffffff',
      boxOpacity: 0.16,
      glassBlur: 5,
      glassOutlineOpacity: 0.26,
      padding: 116,
      contentPadding: 32,
      cornerRadius: 22,
      shadowColor: '#06080f',
      shadowStrength: 0.9,
      shadowSoftness: 1.08,
      shadowDistance: 1,
      alignment: 'center'
    },
    text: DEFAULT_MANTLE_TEXT
  },
  {
    id: 'marbling',
    label: 'Marbling',
    hint: 'Monochrome marble · hard ink drift',
    background: {
      family: 'gradient',
      presetId: 'marbling',
      seed: 'marbling',
      intensity: 0.8,
      params: {
        complexity: 1,
        sharpness: 1,
        curve: 1,
        grain: 0.05
      },
      colors: ['#050505', '#f5f5f5', '#252525', '#d8d8d8', '#737373', '#ffffff'],
      palette: {
        background: '#050505',
        foreground: '#f5f5f5',
        accent: '#d8d8d8',
        muted: '#737373'
      }
    },
    frame: {
      preset: 'minimal-browser',
      boxStyle: 'glass-panel',
      boxColor: '#ffffff',
      boxOpacity: 0.16,
      glassBlur: 5,
      glassOutlineOpacity: 0.24,
      padding: 116,
      contentPadding: 32,
      cornerRadius: 22,
      shadowColor: '#ffffff',
      shadowStrength: 0.95,
      shadowSoftness: 1.1,
      shadowDistance: 1,
      alignment: 'center'
    },
    text: DEFAULT_MANTLE_TEXT
  },
  {
    id: 'signal-field',
    label: 'Signal Field',
    hint: 'Black shader · electric bands',
    background: {
      family: 'mesh',
      presetId: 'signal-field',
      seed: 'signal-field',
      intensity: 0.78,
      params: {
        lineDensity: 0.6,
        thickness: 0.34,
        glow: 0.86
      },
      palette: {
        background: '#01020a',
        foreground: '#f6fbff',
        accent: '#00a6ff',
        muted: '#5b4df5'
      }
    },
    frame: {
      preset: 'minimal-browser',
      boxStyle: 'glass-panel',
      boxColor: '#111827',
      boxOpacity: 0.34,
      glassBlur: 5,
      glassOutlineOpacity: 0.18,
      padding: 112,
      contentPadding: 30,
      cornerRadius: 22,
      shadowColor: '#000000',
      shadowStrength: 1.2,
      shadowSoftness: 1.24,
      shadowDistance: 1.08,
      alignment: 'center'
    },
    text: DEFAULT_MANTLE_TEXT
  },
  {
    id: 'symbol-wave',
    label: 'Symbol Wave',
    hint: 'Black field · glowing glyph flow',
    background: {
      family: 'glyph-field',
      presetId: 'symbol-wave',
      seed: 'symbol-wave',
      intensity: 0.76,
      params: {
        glyphAmount: 0.62,
        waveHeight: 0.58,
        glow: 0.84
      },
      palette: {
        background: '#020204',
        foreground: '#f4fff8',
        accent: '#6fffe9',
        muted: '#7c8a86'
      }
    },
    frame: {
      preset: 'minimal-browser',
      boxStyle: 'solid',
      padding: 104,
      contentPadding: 0,
      cornerRadius: 24,
      shadowColor: '#000000',
      shadowStrength: 1.25,
      shadowSoftness: 1.28,
      shadowDistance: 1.08,
      alignment: 'center'
    },
    text: DEFAULT_MANTLE_TEXT
  },
  {
    id: 'falling-pattern',
    label: 'Falling Pattern',
    hint: 'Falling glyphs · code rain',
    background: {
      family: 'glyph-field',
      presetId: 'falling-pattern',
      seed: 'falling-pattern',
      intensity: 0.76,
      params: {
        glyphDensity: 0.52,
        sweepGlow: 0.62,
        glow: 0.78
      },
      palette: {
        background: '#030609',
        foreground: '#edfff8',
        accent: '#40ffb5',
        muted: '#2d8aff'
      }
    },
    frame: {
      preset: 'terminal-window',
      boxStyle: 'solid',
      padding: 106,
      contentPadding: 0,
      cornerRadius: 22,
      shadowColor: '#000000',
      shadowStrength: 1.2,
      shadowSoftness: 1.2,
      shadowDistance: 1.05,
      alignment: 'center'
    },
    text: DEFAULT_MANTLE_TEXT
  },
  {
    id: 'smoke-veil',
    label: 'Smoke Veil',
    hint: 'Dark smoke · soft grain',
    background: {
      family: 'mesh',
      presetId: 'smoke-veil',
      seed: 'smoke-veil',
      intensity: 0.58,
      params: {
        details: 0.62,
        glow: 0.58,
        grain: 0.08
      },
      palette: {
        background: '#060609',
        foreground: '#e8ebff',
        accent: '#8b7dff',
        muted: '#3d6a76'
      }
    },
    frame: {
      preset: 'minimal-browser',
      boxStyle: 'glass-panel',
      boxColor: '#ffffff',
      boxOpacity: 0.18,
      glassBlur: 5,
      glassOutlineOpacity: 0.16,
      padding: 114,
      contentPadding: 32,
      cornerRadius: 24,
      shadowColor: '#000000',
      shadowStrength: 1.05,
      shadowSoftness: 1.18,
      shadowDistance: 1,
      alignment: 'center'
    },
    text: DEFAULT_MANTLE_TEXT
  },
  {
    id: 'terminal-scanline',
    label: 'Terminal Scanline',
    hint: 'Quiet CRT · macOS window',
    background: {
      family: 'glyph-field',
      presetId: 'terminal-scanline',
      seed: 'terminal-scanline',
      intensity: 0.56,
      params: {
        scanlineDensity: 0.4,
        glyphDensity: 0.2,
        sweepGlow: 0.32
      },
      palette: {
        background: '#08090d',
        foreground: '#dfe9e2',
        accent: '#6fbfa8',
        muted: '#5a6b66'
      }
    },
    frame: {
      preset: 'macos-window',
      boxStyle: 'solid',
      padding: 104,
      contentPadding: 0,
      cornerRadius: 22,
      shadowColor: '#08090d',
      shadowStrength: 1.05,
      shadowSoftness: 1.18,
      shadowDistance: 1.05,
      alignment: 'center'
    },
    text: DEFAULT_MANTLE_TEXT
  },
  {
    id: 'contour-lines',
    label: 'Contour Lines',
    hint: 'Editorial topography',
    background: {
      family: 'mesh',
      presetId: 'contour-lines',
      seed: 'contour-lines',
      intensity: 0.62,
      params: {
        lineDensity: 0.62,
        relief: 0.56,
        accentGlow: 0.48
      },
      palette: {
        background: '#0f1114',
        foreground: '#ecefe9',
        accent: '#d6c7a1',
        muted: '#6f7680'
      }
    },
    frame: {
      preset: 'minimal-browser',
      boxStyle: 'solid',
      padding: 112,
      contentPadding: 0,
      cornerRadius: 26,
      shadowColor: '#000000',
      shadowStrength: 1,
      shadowSoftness: 1,
      shadowDistance: 1,
      alignment: 'center'
    },
    text: DEFAULT_MANTLE_TEXT
  },
  {
    id: 'dot-grid',
    label: 'Dot Grid',
    hint: 'Off-white paper · notebook dots',
    background: {
      family: 'solid',
      presetId: 'dot-grid',
      seed: 'dot-grid',
      intensity: 0.34,
      params: {
        dotOpacity: 0.34,
        dotSize: 0.25,
        dotDensity: 0.42
      },
      palette: {
        background: '#edefe9',
        foreground: '#111417',
        accent: '#3f6d60',
        muted: '#70776f'
      }
    },
    frame: {
      preset: 'none',
      boxStyle: 'none',
      padding: 88,
      contentPadding: 0,
      cornerRadius: 14,
      shadowColor: '#281a0c',
      shadowStrength: 0.55,
      shadowSoftness: 0.9,
      shadowDistance: 0.72,
      alignment: 'center'
    },
    text: DEFAULT_MANTLE_TEXT
  }
];

export function createBackgroundSeed(presetId: string): string {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${presetId}-${suffix}`;
}

function getDefaultBackgroundColorsForPreset(
  presetId: MantleBackgroundPresetId
): Pick<MantleBackground, 'palette' | 'colors'> | undefined {
  const preset = STYLE_PRESETS.find((item) => item.background.presetId === presetId);
  if (!preset) return undefined;

  return {
    palette: { ...preset.background.palette },
    colors: preset.background.colors ? [...preset.background.colors] : undefined
  };
}

export function resetBackgroundColors(background: MantleBackground): MantleBackground {
  const defaults = getDefaultBackgroundColorsForPreset(background.presetId);
  if (!defaults) return background;

  return {
    ...background,
    palette: defaults.palette,
    colors: defaults.colors
  };
}

export function cloneBackground(background: MantleBackground): MantleBackground {
  return {
    ...background,
    params: background.params ? { ...background.params } : undefined,
    palette: { ...background.palette },
    colors: background.colors ? [...background.colors] : undefined
  };
}

export function cloneFrame(frame: MantleFrame): MantleFrame {
  return { ...frame };
}

export function cloneText(text: MantleText): MantleText {
  return {
    ...text,
    transform: text.transform ? { ...text.transform } : undefined
  };
}

export function updateBackgroundParam(
  background: MantleBackground,
  paramId: MantleBackgroundParamId,
  value: number
): MantleBackground {
  const params: MantleBackgroundParams = { ...background.params };
  params[paramId] = value;
  return { ...background, params };
}

export function createBackgroundForPreset(
  currentBackground: MantleBackground,
  presetId: MantleBackgroundPresetId
): MantleBackground {
  const nextBackground: MantleBackground = {
    ...currentBackground,
    family: MANTLE_BACKGROUND_PRESET_FAMILY[presetId],
    presetId,
    params: getBackgroundPresetDefaultParams(presetId),
    colors: undefined,
    imageAssetId: undefined
  };

  if (
    presetId === 'aurora-gradient' ||
    presetId === 'marbling'
  ) {
    return syncGradientColorsWithPalette(
      nextBackground,
      getDefaultBackgroundColorsForPreset(presetId)?.colors ??
        getGradientColorsFromBackground(currentBackground)
    );
  }

  if (presetId !== 'soft-gradient') return nextBackground;
  const defaultColors = getDefaultBackgroundColorsForPreset(presetId)?.colors;
  const sourceColors =
    currentBackground.family === 'gradient'
      ? getGradientColorsFromBackground(currentBackground)
      : defaultColors;

  return syncGradientColorsWithPalette(
    nextBackground,
    sourceColors ?? getGradientColorsFromBackground(currentBackground)
  );
}

export function stylePresetToTheme(preset: StylePreset): MantleTheme {
  return {
    id: preset.id,
    name: preset.label,
    background: cloneBackground(preset.background),
    frame: cloneFrame(preset.frame),
    text: cloneText(preset.text)
  };
}

export function upsertTheme(
  themes: MantleTheme[],
  theme: MantleTheme
): MantleTheme[] {
  return themes.some((item) => item.id === theme.id)
    ? themes.map((item) => (item.id === theme.id ? theme : item))
    : [...themes, theme];
}
