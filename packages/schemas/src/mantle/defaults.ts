import type {
  MantleBackground,
  MantleExportSettings,
  MantleFrame,
  MantlePalette,
  MantleSurfaceTarget,
  MantleText,
  MantleTheme
} from './model';

type DeepFreezable =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly DeepFreezable[]
  | { readonly [key: string]: DeepFreezable };

function deepFreeze<T extends DeepFreezable>(value: T): T {
  if (value == null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  Object.values(value).forEach((item) => {
    deepFreeze(item);
  });
  return value;
}

export const DEFAULT_MANTLE_PALETTE: MantlePalette = deepFreeze({
  background: '#08080a',
  foreground: '#f4f1e8',
  accent: '#9ad7c7',
  muted: '#86827a'
});

export const DEFAULT_MANTLE_TEXT: MantleText = deepFreeze({
  placement: 'none',
  align: 'center',
  titleFont: 'sans',
  subtitleFont: 'sans',
  scale: 1,
  width: 0.68,
  gap: 64
});

export const DEFAULT_MANTLE_BACKGROUND: MantleBackground = deepFreeze({
  family: 'glyph-field',
  presetId: 'terminal-scanline',
  seed: 'mantle-default',
  intensity: 0.72,
  params: {
    scanlineDensity: 0.72,
    glyphDensity: 0.42,
    sweepGlow: 0.68
  },
  palette: DEFAULT_MANTLE_PALETTE
});

export const DEFAULT_MANTLE_FRAME: MantleFrame = deepFreeze({
  preset: 'minimal-browser',
  boxStyle: 'solid',
  padding: 96,
  contentPadding: 0,
  cornerRadius: 24,
  shadowColor: '#000000',
  shadowStrength: 1,
  shadowSoftness: 1,
  shadowDistance: 1,
  alignment: 'center'
});

export const DEFAULT_MANTLE_EXPORT: MantleExportSettings = deepFreeze({
  format: 'png',
  scale: 2
});

export const DEFAULT_MANTLE_TARGETS: MantleSurfaceTarget[] = deepFreeze([
  {
    id: 'x-post-landscape',
    kind: 'x-post-landscape',
    label: 'X landscape',
    width: 1600,
    height: 900,
    platform: 'social',
    aspectRatioPresetId: '16:9'
  },
  {
    id: 'linkedin-feed',
    kind: 'linkedin-feed',
    label: 'LinkedIn feed',
    width: 1200,
    height: 627,
    platform: 'social',
    aspectRatioPresetId: '1.91:1'
  },
  {
    id: 'bluesky-post',
    kind: 'bluesky-post',
    label: 'Bluesky post',
    width: 1600,
    height: 900,
    platform: 'social',
    aspectRatioPresetId: '16:9'
  },
  {
    id: 'square',
    kind: 'square',
    label: 'Square',
    width: 1080,
    height: 1080,
    platform: 'social',
    aspectRatioPresetId: '1:1'
  },
  {
    id: 'portrait',
    kind: 'portrait',
    label: 'Portrait',
    width: 1080,
    height: 1350,
    platform: 'social',
    aspectRatioPresetId: '4:5'
  },
  {
    id: 'og-image',
    kind: 'og-image',
    label: 'Open Graph',
    width: 1200,
    height: 630,
    platform: 'docs',
    aspectRatioPresetId: '1.91:1'
  }
]);

export const DEFAULT_MANTLE_THEME: MantleTheme = deepFreeze({
  id: 'terminal-scanline',
  name: 'Terminal Scanline',
  background: DEFAULT_MANTLE_BACKGROUND,
  frame: DEFAULT_MANTLE_FRAME,
  text: DEFAULT_MANTLE_TEXT
});
