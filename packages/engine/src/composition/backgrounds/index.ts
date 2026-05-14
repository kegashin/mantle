import {
  MANTLE_BACKGROUND_PRESET_IDS,
  type MantleBackgroundParamId,
  type MantleBackgroundParams,
  type MantleBackgroundPresetId
} from '@mantle/schemas/model';

import { auroraGradient } from './auroraGradient';
import { symbolWave } from './symbolWave';
import { contourLines } from './contourLines';
import { dotGrid } from './dotGrid';
import { fallingPattern } from './fallingPattern';
import { marbling } from './marbling';
import { signalField } from './signalField';
import { smokeVeil } from './smokeVeil';
import { softGradient } from './softGradient';
import { solidColor } from './solidColor';
import { terminalScanline } from './terminalScanline';
import type { BackgroundGenerator } from './types';

export type {
  BackgroundGenerator,
  BackgroundGeneratorInput
} from './types';

export type BackgroundPresetId = MantleBackgroundPresetId;

export type BackgroundPresetDescriptor = {
  id: BackgroundPresetId;
  label: string;
  hint: string;
  family: 'tech' | 'editorial' | 'mixed' | 'quiet';
  params: BackgroundParamDescriptor[];
};

export type BackgroundParamDescriptor = {
  id: MantleBackgroundParamId;
  label: string;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
};

export const BACKGROUND_PRESETS: BackgroundPresetDescriptor[] = [
  {
    id: 'solid-color',
    label: 'Default',
    hint: 'Flat background color',
    family: 'quiet',
    params: []
  },
  {
    id: 'image-fill',
    label: 'Image',
    hint: 'Uploaded background image',
    family: 'editorial',
    params: []
  },
  {
    id: 'soft-gradient',
    label: 'Linear Gradient',
    hint: 'Directional gradient wash',
    family: 'mixed',
    params: [
      {
        id: 'angle',
        label: 'Angle',
        defaultValue: 0.58,
        min: 0,
        max: 1,
        step: 0.01
      },
      {
        id: 'spread',
        label: 'Color spread',
        defaultValue: 0.58,
        min: 0,
        max: 1,
        step: 0.01
      },
      {
        id: 'glow',
        label: 'Glow',
        defaultValue: 0.46,
        min: 0,
        max: 1,
        step: 0.01
      },
      {
        id: 'grain',
        label: 'Grain',
        defaultValue: 0.08,
        min: 0,
        max: 1,
        step: 0.01
      }
    ]
  },
  {
    id: 'aurora-gradient',
    label: 'Aurora Gradient',
    hint: 'Layered radial glow',
    family: 'mixed',
    params: [
      {
        id: 'glow',
        label: 'Glow',
        defaultValue: 4,
        min: 0,
        max: 4,
        step: 0.01
      },
      {
        id: 'spread',
        label: 'Spread',
        defaultValue: 0.7,
        min: 0,
        max: 3,
        step: 0.01
      },
      {
        id: 'grain',
        label: 'Grain',
        defaultValue: 0.06,
        min: 0,
        max: 1,
        step: 0.01
      }
    ]
  },
  {
    id: 'marbling',
    label: 'Marbling',
    hint: 'Color zones with curved borders',
    family: 'mixed',
    params: [
      {
        id: 'complexity',
        label: 'Region count',
        defaultValue: 1,
        min: 0,
        max: 2,
        step: 0.01
      },
      {
        id: 'sharpness',
        label: 'Edge sharpness',
        defaultValue: 1,
        min: 0,
        max: 2,
        step: 0.01
      },
      {
        id: 'curve',
        label: 'Curve amount',
        defaultValue: 1,
        min: 0,
        max: 4,
        step: 0.01
      },
      {
        id: 'grain',
        label: 'Grain',
        defaultValue: 0.06,
        min: 0,
        max: 2,
        step: 0.01
      }
    ]
  },
  {
    id: 'signal-field',
    label: 'Signal Field',
    hint: 'Shader-like electric bands',
    family: 'tech',
    params: [
      {
        id: 'lineDensity',
        label: 'Band frequency',
        defaultValue: 0.6,
        min: 0,
        max: 1,
        step: 0.01
      },
      {
        id: 'thickness',
        label: 'Core width',
        defaultValue: 0.34,
        min: 0,
        max: 1,
        step: 0.01
      },
      {
        id: 'glow',
        label: 'Halo intensity',
        defaultValue: 0.86,
        min: 0,
        max: 1,
        step: 0.01
      }
    ]
  },
  {
    id: 'symbol-wave',
    label: 'Symbol Wave',
    hint: 'Full-field glyphs, luminous wave',
    family: 'tech',
    params: [
      {
        id: 'glyphAmount',
        label: 'Symbol density',
        defaultValue: 0.62,
        min: 0,
        max: 1,
        step: 0.01
      },
      {
        id: 'waveHeight',
        label: 'Wave shape',
        defaultValue: 0.58,
        min: 0,
        max: 1,
        step: 0.01
      },
      {
        id: 'glow',
        label: 'Glow',
        defaultValue: 0.84,
        min: 0,
        max: 1,
        step: 0.01
      }
    ]
  },
  {
    id: 'falling-pattern',
    label: 'Falling Pattern',
    hint: 'Descending glyph trails',
    family: 'tech',
    params: [
      {
        id: 'glyphDensity',
        label: 'Glyph amount',
        defaultValue: 0.52,
        min: 0,
        max: 1,
        step: 0.01
      },
      {
        id: 'sweepGlow',
        label: 'Trail length',
        defaultValue: 0.62,
        min: 0,
        max: 1,
        step: 0.01
      },
      {
        id: 'glow',
        label: 'Glow',
        defaultValue: 0.78,
        min: 0,
        max: 1,
        step: 0.01
      }
    ]
  },
  {
    id: 'smoke-veil',
    label: 'Smoke Veil',
    hint: 'Soft smoke and grain',
    family: 'editorial',
    params: [
      {
        id: 'details',
        label: 'Smoke detail',
        defaultValue: 0.62,
        min: 0,
        max: 1,
        step: 0.01
      },
      {
        id: 'glow',
        label: 'Glow',
        defaultValue: 0.58,
        min: 0,
        max: 1,
        step: 0.01
      },
      {
        id: 'grain',
        label: 'Grain',
        defaultValue: 0.08,
        min: 0,
        max: 1,
        step: 0.01
      }
    ]
  },
  {
    id: 'terminal-scanline',
    label: 'Terminal Scanline',
    hint: 'CRT phosphor, scanline texture',
    family: 'tech',
    params: [
      {
        id: 'scanlineDensity',
        label: 'Scanline strength',
        defaultValue: 0.72,
        min: 0,
        max: 1,
        step: 0.01
      },
      {
        id: 'glyphDensity',
        label: 'Glyph amount',
        defaultValue: 0.42,
        min: 0,
        max: 1,
        step: 0.01
      },
      {
        id: 'sweepGlow',
        label: 'Sweep glow',
        defaultValue: 0.68,
        min: 0,
        max: 1,
        step: 0.01
      }
    ]
  },
  {
    id: 'contour-lines',
    label: 'Contour Lines',
    hint: 'Topographic iso-lines, editorial',
    family: 'editorial',
    params: [
      {
        id: 'lineDensity',
        label: 'Line density',
        defaultValue: 0.62,
        min: 0,
        max: 1,
        step: 0.01
      },
      {
        id: 'relief',
        label: 'Relief',
        defaultValue: 0.56,
        min: 0,
        max: 1,
        step: 0.01
      },
      {
        id: 'accentGlow',
        label: 'Accent glow',
        defaultValue: 0.48,
        min: 0,
        max: 1,
        step: 0.01
      }
    ]
  },
  {
    id: 'dot-grid',
    label: 'Dot Grid',
    hint: 'Quiet docs/notebook',
    family: 'quiet',
    params: [
      {
        id: 'dotOpacity',
        label: 'Dot opacity',
        defaultValue: 0.86,
        min: 0,
        max: 2,
        step: 0.01
      },
      {
        id: 'dotSize',
        label: 'Dot size',
        defaultValue: 0.62,
        min: 0,
        max: 1,
        step: 0.01
      },
      {
        id: 'dotDensity',
        label: 'Dot density',
        defaultValue: 0.5,
        min: 0,
        max: 1,
        step: 0.01
      }
    ]
  }
];

const REGISTRY: Record<BackgroundPresetId, BackgroundGenerator> = {
  'solid-color': solidColor,
  'image-fill': solidColor,
  'soft-gradient': softGradient,
  'aurora-gradient': auroraGradient,
  'marbling': marbling,
  'smoke-veil': smokeVeil,
  'signal-field': signalField,
  'symbol-wave': symbolWave,
  'falling-pattern': fallingPattern,
  'terminal-scanline': terminalScanline,
  'contour-lines': contourLines,
  'dot-grid': dotGrid
};

const ANIMATED_BACKGROUND_PRESET_IDS = new Set<BackgroundPresetId>([
  'aurora-gradient',
  'falling-pattern',
  'marbling',
  'signal-field',
  'smoke-veil',
  'symbol-wave',
  'terminal-scanline'
]);

const PRESETS_BY_ID = new Map<BackgroundPresetId, BackgroundPresetDescriptor>(
  BACKGROUND_PRESETS.map((preset) => [preset.id, preset])
);

export const BACKGROUND_PRESET_IDS = MANTLE_BACKGROUND_PRESET_IDS;

export function resolveBackgroundPresetDescriptor(
  presetId: BackgroundPresetId
): BackgroundPresetDescriptor {
  const descriptor = PRESETS_BY_ID.get(presetId);
  if (!descriptor) {
    throw new Error(`Unknown Mantle background preset "${presetId}".`);
  }
  return descriptor;
}

export function getBackgroundPresetDefaultParams(
  presetId: BackgroundPresetId
): MantleBackgroundParams {
  const params: MantleBackgroundParams = {};
  resolveBackgroundPresetDescriptor(presetId).params.forEach((param) => {
    params[param.id] = param.defaultValue;
  });
  return params;
}

export function resolveBackgroundGenerator(presetId: BackgroundPresetId): BackgroundGenerator {
  const generator = REGISTRY[presetId];
  if (!generator) {
    throw new Error(`Unknown Mantle background preset "${presetId}".`);
  }
  return generator;
}

export function isAnimatedBackgroundPresetId(
  presetId: BackgroundPresetId
): boolean {
  return ANIMATED_BACKGROUND_PRESET_IDS.has(presetId);
}

export function isKnownBackgroundPresetId(presetId: string): presetId is BackgroundPresetId {
  return MANTLE_BACKGROUND_PRESET_IDS.some((knownId) => knownId === presetId);
}
