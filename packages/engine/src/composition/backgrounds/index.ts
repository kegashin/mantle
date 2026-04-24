import { contourLines } from './contourLines';
import { dotGrid } from './dotGrid';
import { solidColor } from './solidColor';
import { terminalScanline } from './terminalScanline';
import type { BackgroundGenerator } from './types';

export type {
  BackgroundGenerator,
  BackgroundGeneratorInput
} from './types';

export type BackgroundPresetId =
  | 'solid-color'
  | 'terminal-scanline'
  | 'contour-lines'
  | 'dot-grid';

export type BackgroundPresetDescriptor = {
  id: BackgroundPresetId;
  label: string;
  hint: string;
  family: 'tech' | 'editorial' | 'mixed' | 'quiet';
  params: BackgroundParamDescriptor[];
};

export type BackgroundParamDescriptor = {
  id: string;
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
        defaultValue: 0.34,
        min: 0,
        max: 1,
        step: 0.01
      },
      {
        id: 'dotDensity',
        label: 'Dot density',
        defaultValue: 0.42,
        min: 0,
        max: 1,
        step: 0.01
      }
    ]
  }
];

const REGISTRY: Record<BackgroundPresetId, BackgroundGenerator> = {
  'solid-color': solidColor,
  'terminal-scanline': terminalScanline,
  'contour-lines': contourLines,
  'dot-grid': dotGrid
};

const PRESET_ALIASES: Record<string, BackgroundPresetId> = {
  default: 'solid-color',
  solid: 'solid-color',
  'terminal-glass': 'terminal-scanline',
  'quiet-graphite': 'contour-lines',
  'docs-clean': 'dot-grid'
};

const PRESETS_BY_ID = Object.fromEntries(
  BACKGROUND_PRESETS.map((preset) => [preset.id, preset])
) as Record<BackgroundPresetId, BackgroundPresetDescriptor>;

export const BACKGROUND_PRESET_IDS = Object.keys(REGISTRY) as BackgroundPresetId[];

export function normalizeBackgroundPresetId(presetId: string): BackgroundPresetId {
  if (presetId in REGISTRY) {
    return presetId as BackgroundPresetId;
  }
  return PRESET_ALIASES[presetId] ?? 'terminal-scanline';
}

export function resolveBackgroundPresetDescriptor(
  presetId: string
): BackgroundPresetDescriptor {
  return PRESETS_BY_ID[normalizeBackgroundPresetId(presetId)];
}

export function getBackgroundPresetDefaultParams(
  presetId: string
): Record<string, number> {
  return Object.fromEntries(
    resolveBackgroundPresetDescriptor(presetId).params.map((param) => [
      param.id,
      param.defaultValue
    ])
  );
}

export function resolveBackgroundGenerator(presetId: string): BackgroundGenerator {
  return REGISTRY[normalizeBackgroundPresetId(presetId)];
}

export function isKnownBackgroundPresetId(presetId: string): presetId is BackgroundPresetId {
  return presetId in REGISTRY;
}
