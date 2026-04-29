export const MANTLE_ASSET_ROLES = [
  'screenshot',
  'background',
  'overlay',
  'logo',
  'reference'
] as const;
export type MantleAssetRole = (typeof MANTLE_ASSET_ROLES)[number];

export type MantleAsset = {
  id: string;
  role: MantleAssetRole;
  name: string;
  mimeType?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  fileSize?: number | undefined;
  sourcePath?: string | undefined;
};

export type MantleRuntimeAsset = MantleAsset & {
  objectUrl?: string | undefined;
};

export type MantleRenderableAsset = MantleRuntimeAsset;

export const MANTLE_HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export type MantleHexColor = string;

export type MantlePalette = {
  background: MantleHexColor;
  foreground: MantleHexColor;
  accent: MantleHexColor;
  muted?: MantleHexColor | undefined;
};

export const MANTLE_BACKGROUND_FAMILIES = [
  'solid',
  'gradient',
  'mesh',
  'glyph-field',
  'image'
] as const;
export type MantleBackgroundFamily =
  (typeof MANTLE_BACKGROUND_FAMILIES)[number];

export const MANTLE_BACKGROUND_PRESET_IDS = [
  'solid-color',
  'image-fill',
  'soft-gradient',
  'aurora-gradient',
  'marbling',
  'smoke-veil',
  'signal-field',
  'symbol-wave',
  'falling-pattern',
  'terminal-scanline',
  'contour-lines',
  'dot-grid'
] as const;
export type MantleBackgroundPresetId =
  (typeof MANTLE_BACKGROUND_PRESET_IDS)[number];

export const MANTLE_BACKGROUND_PARAM_IDS = [
  'angle',
  'spread',
  'glow',
  'grain',
  'thickness',
  'curve',
  'details',
  'glyphAmount',
  'waveHeight',
  'scanlineDensity',
  'glyphDensity',
  'sweepGlow',
  'lineDensity',
  'relief',
  'accentGlow',
  'dotOpacity',
  'dotSize',
  'dotDensity',
  'complexity',
  'sharpness'
] as const;
export type MantleBackgroundParamId =
  (typeof MANTLE_BACKGROUND_PARAM_IDS)[number];
export type MantleBackgroundParams = Partial<
  Record<MantleBackgroundParamId, number>
>;

export const MANTLE_BACKGROUND_PRESET_FAMILY: Record<
  MantleBackgroundPresetId,
  MantleBackgroundFamily
> = {
  'solid-color': 'solid',
  'image-fill': 'image',
  'soft-gradient': 'gradient',
  'aurora-gradient': 'gradient',
  marbling: 'gradient',
  'smoke-veil': 'mesh',
  'signal-field': 'mesh',
  'symbol-wave': 'glyph-field',
  'falling-pattern': 'glyph-field',
  'terminal-scanline': 'glyph-field',
  'contour-lines': 'mesh',
  'dot-grid': 'solid'
};

export const MANTLE_BACKGROUND_COLOR_PRESET_IDS =
  new Set<MantleBackgroundPresetId>([
    'soft-gradient',
    'aurora-gradient',
    'marbling'
  ]);

export type MantleBackground = {
  family: MantleBackgroundFamily;
  presetId: MantleBackgroundPresetId;
  seed: string;
  intensity: number;
  params?: MantleBackgroundParams | undefined;
  palette: MantlePalette;
  colors?: MantleHexColor[] | undefined;
  imageAssetId?: string | undefined;
};

export type MantleBrand = {
  name: string;
  website?: string | undefined;
  palette: MantlePalette;
  fontFamily?: string | undefined;
  logoAssetId?: string | undefined;
};

export const MANTLE_EXPORT_FORMATS = ['png', 'jpeg', 'webp'] as const;
export type MantleExportFormat = (typeof MANTLE_EXPORT_FORMATS)[number];

export type MantleExportSettings = {
  format: MantleExportFormat;
  scale: number;
  quality?: number | undefined;
  fileName?: string | undefined;
};

export type ExportResult = {
  blob: Blob;
  filename: string;
  mimeType: string;
};

export const MANTLE_SOURCE_PLACEMENT_MODES = ['fit', 'fill', 'crop'] as const;
export type MantleSourcePlacementMode =
  (typeof MANTLE_SOURCE_PLACEMENT_MODES)[number];

export type MantleSourceCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MantleSourceFocus = {
  x: number;
  y: number;
};

export type MantleSourcePlacement = {
  mode: MantleSourcePlacementMode;
  crop?: MantleSourceCrop | undefined;
  focus?: MantleSourceFocus | undefined;
  zoom?: number | undefined;
};

export type MantleFrameTransform = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
};

export const MANTLE_FRAME_PRESETS = [
  'none',
  'minimal-browser',
  'macos-window',
  'windows-window',
  'terminal-window',
  'code-editor',
  'document-page'
] as const;
export type MantleFramePreset = (typeof MANTLE_FRAME_PRESETS)[number];

export const MANTLE_FRAME_BOX_STYLES = [
  'none',
  'solid',
  'glass-panel'
] as const;
export type MantleFrameBoxStyle = (typeof MANTLE_FRAME_BOX_STYLES)[number];

export const MANTLE_ALIGNMENTS = [
  'center',
  'top',
  'bottom',
  'left',
  'right'
] as const;
export type MantleAlignment = (typeof MANTLE_ALIGNMENTS)[number];

export type MantleFrame = {
  preset: MantleFramePreset;
  boxStyle?: MantleFrameBoxStyle | undefined;
  boxColor?: MantleHexColor | undefined;
  boxOpacity?: number | undefined;
  glassBlur?: number | undefined;
  glassOutlineOpacity?: number | undefined;
  chromeText?: string | undefined;
  padding: number;
  contentPadding?: number | undefined;
  cornerRadius: number;
  shadowColor?: MantleHexColor | undefined;
  shadowStrength?: number | undefined;
  shadowSoftness?: number | undefined;
  shadowDistance?: number | undefined;
  alignment: MantleAlignment;
};

export const MANTLE_SURFACE_KINDS = [
  'x-post-landscape',
  'x-post-square',
  'linkedin-feed',
  'bluesky-post',
  'mastodon-post',
  'product-hunt-gallery',
  'og-image',
  'square',
  'portrait',
  'custom'
] as const;
export type MantleSurfaceKind = (typeof MANTLE_SURFACE_KINDS)[number];

export const MANTLE_SURFACE_ASPECT_RATIO_PRESETS = [
  'free',
  'custom-ratio',
  '1:1',
  '16:9',
  '9:16',
  '4:5',
  '1.91:1'
] as const;
export type MantleSurfaceAspectRatioPreset =
  (typeof MANTLE_SURFACE_ASPECT_RATIO_PRESETS)[number];

export const MANTLE_SURFACE_PLATFORMS = [
  'social',
  'docs',
  'launch',
  'custom'
] as const;
export type MantleSurfacePlatform = (typeof MANTLE_SURFACE_PLATFORMS)[number];

export type MantleSafeArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MantleSurfaceTarget = {
  id: string;
  kind: MantleSurfaceKind;
  label: string;
  width: number;
  height: number;
  platform: MantleSurfacePlatform;
  aspectRatioPresetId?: MantleSurfaceAspectRatioPreset | undefined;
  safeArea?: MantleSafeArea | undefined;
};

export const MANTLE_TEXT_PLACEMENTS = [
  'none',
  'top',
  'bottom',
  'left',
  'right'
] as const;
export type MantleTextPlacement = (typeof MANTLE_TEXT_PLACEMENTS)[number];

export const MANTLE_TEXT_FONTS = [
  'sans',
  'system',
  'display',
  'rounded',
  'serif',
  'editorial',
  'slab',
  'mono',
  'code',
  'condensed'
] as const;
export type MantleTextFont = (typeof MANTLE_TEXT_FONTS)[number];

export const MANTLE_TEXT_ALIGNMENTS = ['left', 'center', 'right'] as const;
export type MantleTextAlignment = (typeof MANTLE_TEXT_ALIGNMENTS)[number];

export const MANTLE_TEXT_SHADOWS = ['auto', 'on', 'off'] as const;
export type MantleTextShadow = (typeof MANTLE_TEXT_SHADOWS)[number];

export type MantleText = {
  placement: MantleTextPlacement;
  align: MantleTextAlignment;
  titleFont: MantleTextFont;
  subtitleFont: MantleTextFont;
  titleColor?: MantleHexColor | undefined;
  subtitleColor?: MantleHexColor | undefined;
  title?: string | undefined;
  subtitle?: string | undefined;
  scale: number;
  width: number;
  gap: number;
  shadow: MantleTextShadow;
};

export type MantleTheme = {
  id: string;
  name: string;
  background: MantleBackground;
  frame: MantleFrame;
  text: MantleText;
};

export type MantleCard = {
  id: string;
  name: string;
  targetId: string;
  sourceAssetId?: string | undefined;
  templateId: string;
  themeId: string;
  background: MantleBackground;
  sourcePlacement?: MantleSourcePlacement | undefined;
  frameTransform?: MantleFrameTransform | undefined;
  frame: MantleFrame;
  text: MantleText;
  export: MantleExportSettings;
};

export type MantleProject = {
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  activeCardId: string;
  assets: MantleAsset[];
  cards: MantleCard[];
  targets: MantleSurfaceTarget[];
  brand: MantleBrand;
  themes: MantleTheme[];
};

export type MantleRuntimeProject = Omit<MantleProject, 'assets'> & {
  assets: MantleRuntimeAsset[];
};
