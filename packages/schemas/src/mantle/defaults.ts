import type {
  MantleBackground,
  MantleExportSettings,
  MantleFrame,
  MantleFrameTransform,
  MantlePalette,
  MantleSourcePlacement,
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
  background: '#060609',
  foreground: '#f2f4ff',
  accent: '#9a8cff',
  muted: '#3d6a76'
});

export const DEFAULT_MANTLE_TEXT: MantleText = deepFreeze({
  placement: 'none',
  align: 'center',
  titleFont: 'sans',
  subtitleFont: 'sans',
  scale: 1,
  width: 0.68,
  gap: 64,
  shadow: 'auto'
});

export const DEFAULT_MANTLE_BACKGROUND: MantleBackground = deepFreeze({
  family: 'mesh',
  presetId: 'smoke-veil',
  seed: 'smoke-veil',
  intensity: 0.6,
  params: {
    details: 0.68,
    glow: 0.66,
    grain: 0.08
  },
  animation: {
    speed: 0.65
  },
  palette: DEFAULT_MANTLE_PALETTE
});

export const DEFAULT_MANTLE_FRAME: MantleFrame = deepFreeze({
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
});

export const DEFAULT_MANTLE_FRAME_TRANSFORM: MantleFrameTransform = deepFreeze({
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0
});

export const DEFAULT_MANTLE_EXPORT: MantleExportSettings = deepFreeze({
  format: 'png',
  scale: 1,
  audioEnabled: true,
  animateBackground: true
});

export const DEFAULT_MANTLE_SOURCE_PLACEMENT: MantleSourcePlacement = deepFreeze({
  mode: 'fit'
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
  id: 'smoke-veil',
  name: 'Smoke Veil',
  background: DEFAULT_MANTLE_BACKGROUND,
  frame: DEFAULT_MANTLE_FRAME,
  text: DEFAULT_MANTLE_TEXT
});
