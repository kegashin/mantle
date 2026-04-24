import * as z from 'zod';

export const GlyphrameAssetRoleSchema = z.enum([
  'screenshot',
  'background',
  'overlay',
  'logo',
  'reference'
]);
export type GlyphrameAssetRole = z.infer<typeof GlyphrameAssetRoleSchema>;

export const GlyphrameSurfaceKindSchema = z.enum([
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
]);
export type GlyphrameSurfaceKind = z.infer<typeof GlyphrameSurfaceKindSchema>;

export const GlyphrameSurfaceAspectRatioPresetSchema = z.enum([
  'free',
  'custom',
  'custom-ratio',
  '1:1',
  '16:9',
  '9:16',
  '4:5',
  '1.91:1'
]);
export type GlyphrameSurfaceAspectRatioPreset = z.infer<
  typeof GlyphrameSurfaceAspectRatioPresetSchema
>;

export const GlyphrameBackgroundFamilySchema = z.enum([
  'solid',
  'gradient',
  'mesh',
  'glyph-field',
  'ascii-texture',
  'image'
]);
export type GlyphrameBackgroundFamily = z.infer<
  typeof GlyphrameBackgroundFamilySchema
>;

export const GlyphrameFramePresetSchema = z.enum([
  'none',
  'soft-panel',
  'glass-panel',
  'minimal-browser',
  'macos-window',
  'windows-window',
  'terminal-window'
]);
export type GlyphrameFramePreset = z.infer<typeof GlyphrameFramePresetSchema>;

export const GlyphrameFrameBoxStyleSchema = z.enum([
  'none',
  'solid',
  'soft-panel',
  'glass-panel'
]);
export type GlyphrameFrameBoxStyle = z.infer<typeof GlyphrameFrameBoxStyleSchema>;

export const GlyphrameExportFormatSchema = z.enum(['png', 'jpeg', 'webp', 'avif']);
export type GlyphrameExportFormat = z.infer<typeof GlyphrameExportFormatSchema>;

export const GlyphrameAlignmentSchema = z.enum([
  'center',
  'top',
  'bottom',
  'left',
  'right'
]);
export type GlyphrameAlignment = z.infer<typeof GlyphrameAlignmentSchema>;

export const GlyphrameTextPlacementSchema = z.enum([
  'none',
  'top',
  'bottom',
  'left',
  'right'
]);
export type GlyphrameTextPlacement = z.infer<typeof GlyphrameTextPlacementSchema>;

export const GlyphrameTextFontSchema = z.enum([
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
]);
export type GlyphrameTextFont = z.infer<typeof GlyphrameTextFontSchema>;

export const GlyphrameSafeAreaSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
});
export type GlyphrameSafeArea = z.infer<typeof GlyphrameSafeAreaSchema>;

export const GlyphrameSurfaceTargetSchema = z.object({
  id: z.string().min(1),
  kind: GlyphrameSurfaceKindSchema,
  label: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  platform: z.enum(['social', 'docs', 'launch', 'custom']),
  aspectRatioPresetId: GlyphrameSurfaceAspectRatioPresetSchema.optional(),
  safeArea: GlyphrameSafeAreaSchema.optional()
});
export type GlyphrameSurfaceTarget = z.infer<typeof GlyphrameSurfaceTargetSchema>;

export const GlyphrameAssetSchema = z.object({
  id: z.string().min(1),
  role: GlyphrameAssetRoleSchema,
  name: z.string().min(1),
  mimeType: z.string().min(1).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fileSize: z.number().int().nonnegative().optional(),
  dataUrl: z.string().min(1).optional(),
  sourcePath: z.string().min(1).optional()
});
export type GlyphrameAsset = z.infer<typeof GlyphrameAssetSchema>;

export const GlyphramePaletteSchema = z.object({
  background: z.string().min(1),
  foreground: z.string().min(1),
  accent: z.string().min(1),
  muted: z.string().min(1).optional()
});
export type GlyphramePalette = z.infer<typeof GlyphramePaletteSchema>;

export const GlyphrameBackgroundSchema = z.object({
  family: GlyphrameBackgroundFamilySchema,
  presetId: z.string().min(1),
  seed: z.string().min(1),
  intensity: z.number().min(0).max(1),
  params: z.record(z.string(), z.number().min(0).max(1)).optional(),
  palette: GlyphramePaletteSchema,
  imageAssetId: z.string().min(1).optional()
});
export type GlyphrameBackground = z.infer<typeof GlyphrameBackgroundSchema>;

export const GlyphrameFrameSchema = z.object({
  preset: GlyphrameFramePresetSchema,
  boxStyle: GlyphrameFrameBoxStyleSchema.optional(),
  boxColor: z.string().min(1).optional(),
  boxBorderColor: z.string().min(1).optional(),
  boxOpacity: z.number().min(0).max(2).optional(),
  chromeText: z.string().optional(),
  padding: z.number().int().min(0).max(480),
  contentPadding: z.number().int().min(0).max(240).optional(),
  cornerRadius: z.number().int().min(0).max(52),
  shadowPresetId: z.string().min(1).optional(),
  shadowColor: z.string().min(1).optional(),
  shadowStrength: z.number().min(0).max(2).optional(),
  shadowSoftness: z.number().min(0).max(2.5).optional(),
  shadowDistance: z.number().min(0).max(2).optional(),
  alignment: GlyphrameAlignmentSchema
});
export type GlyphrameFrame = z.infer<typeof GlyphrameFrameSchema>;

const DEFAULT_GLYPHRAME_TEXT_VALUE = {
  placement: 'none',
  align: 'center',
  titleFont: 'sans',
  subtitleFont: 'sans',
  scale: 1,
  width: 0.68,
  gap: 64
} as const;

export const GlyphrameTextSchema = z.object({
  placement: GlyphrameTextPlacementSchema,
  align: z.enum(['left', 'center', 'right']),
  titleFont: GlyphrameTextFontSchema.default('sans'),
  subtitleFont: GlyphrameTextFontSchema.default('sans'),
  titleColor: z.string().min(1).optional(),
  subtitleColor: z.string().min(1).optional(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  scale: z.number().min(0.5).max(2),
  width: z.number().min(0.08).max(1),
  gap: z.number().int().min(0).max(240)
});
export type GlyphrameText = z.infer<typeof GlyphrameTextSchema>;

export const DEFAULT_GLYPHRAME_TEXT: GlyphrameText = {
  placement: 'none',
  align: 'center',
  titleFont: 'sans',
  subtitleFont: 'sans',
  scale: 1,
  width: 0.68,
  gap: 64
};

export const GlyphrameExportSettingsSchema = z.object({
  format: GlyphrameExportFormatSchema,
  scale: z.number().min(1).max(5),
  quality: z.number().min(0).max(1).optional()
});
export type GlyphrameExportSettings = z.infer<
  typeof GlyphrameExportSettingsSchema
>;

export const GlyphrameCardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  targetId: z.string().min(1),
  sourceAssetId: z.string().min(1).optional(),
  templateId: z.string().min(1),
  themeId: z.string().min(1),
  background: GlyphrameBackgroundSchema,
  frame: GlyphrameFrameSchema,
  text: GlyphrameTextSchema.default(DEFAULT_GLYPHRAME_TEXT_VALUE),
  export: GlyphrameExportSettingsSchema
});
export type GlyphrameCard = z.infer<typeof GlyphrameCardSchema>;

export const GlyphrameBrandSchema = z.object({
  name: z.string().min(1),
  website: z.string().optional(),
  palette: GlyphramePaletteSchema,
  fontFamily: z.string().min(1).optional(),
  logoAssetId: z.string().min(1).optional()
});
export type GlyphrameBrand = z.infer<typeof GlyphrameBrandSchema>;

export const GlyphrameThemeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  background: GlyphrameBackgroundSchema,
  frame: GlyphrameFrameSchema,
  text: GlyphrameTextSchema.default(DEFAULT_GLYPHRAME_TEXT_VALUE)
});
export type GlyphrameTheme = z.infer<typeof GlyphrameThemeSchema>;

export const GlyphrameProjectSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  activeCardId: z.string().min(1),
  assets: z.array(GlyphrameAssetSchema),
  cards: z.array(GlyphrameCardSchema).min(1),
  targets: z.array(GlyphrameSurfaceTargetSchema).min(1),
  brand: GlyphrameBrandSchema,
  themes: z.array(GlyphrameThemeSchema).min(1)
});
export type GlyphrameProject = z.infer<typeof GlyphrameProjectSchema>;

export const DEFAULT_GLYPHRAME_PALETTE: GlyphramePalette = {
  background: '#08080a',
  foreground: '#f4f1e8',
  accent: '#9ad7c7',
  muted: '#86827a'
};

export const DEFAULT_GLYPHRAME_BACKGROUND: GlyphrameBackground = {
  family: 'glyph-field',
  presetId: 'terminal-scanline',
  seed: 'glyphrame-default',
  intensity: 0.72,
  params: {
    scanlineDensity: 0.72,
    glyphDensity: 0.42,
    sweepGlow: 0.68
  },
  palette: DEFAULT_GLYPHRAME_PALETTE
};

export const DEFAULT_GLYPHRAME_FRAME: GlyphrameFrame = {
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
};

export const DEFAULT_GLYPHRAME_EXPORT: GlyphrameExportSettings = {
  format: 'png',
  scale: 2
};

export const DEFAULT_GLYPHRAME_TARGETS: GlyphrameSurfaceTarget[] = [
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
];

export const DEFAULT_GLYPHRAME_THEME: GlyphrameTheme = {
  id: 'terminal-glass',
  name: 'Terminal Scanline',
  background: DEFAULT_GLYPHRAME_BACKGROUND,
  frame: DEFAULT_GLYPHRAME_FRAME,
  text: DEFAULT_GLYPHRAME_TEXT
};

export function createGlyphrameCard({
  id = 'card-1',
  name = 'Untitled card',
  targetId = DEFAULT_GLYPHRAME_TARGETS[0]?.id ?? 'x-post-landscape',
  sourceAssetId
}: {
  id?: string;
  name?: string;
  targetId?: string;
  sourceAssetId?: string;
} = {}): GlyphrameCard {
  return {
    id,
    name,
    targetId,
    ...(sourceAssetId ? { sourceAssetId } : {}),
    templateId: 'single-shot-centered',
    themeId: DEFAULT_GLYPHRAME_THEME.id,
    background: DEFAULT_GLYPHRAME_BACKGROUND,
    frame: DEFAULT_GLYPHRAME_FRAME,
    text: DEFAULT_GLYPHRAME_TEXT,
    export: DEFAULT_GLYPHRAME_EXPORT
  };
}

export function createGlyphrameProject({
  id = 'glyphrame-project',
  name = 'Glyphrame Project',
  brandName = 'Untitled'
}: {
  id?: string;
  name?: string;
  brandName?: string;
} = {}): GlyphrameProject {
  const now = new Date().toISOString();
  const card = createGlyphrameCard();

  return {
    version: 1,
    id,
    name,
    createdAt: now,
    updatedAt: now,
    activeCardId: card.id,
    assets: [],
    cards: [card],
    targets: DEFAULT_GLYPHRAME_TARGETS,
    brand: {
      name: brandName,
      palette: DEFAULT_GLYPHRAME_PALETTE
    },
    themes: [DEFAULT_GLYPHRAME_THEME]
  };
}
