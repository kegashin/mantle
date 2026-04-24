import * as z from 'zod';

export const LaunchKitAssetKindSchema = z.enum([
  'screenshot',
  'icon',
  'background',
  'overlay'
]);
export type LaunchKitAssetKind = z.infer<typeof LaunchKitAssetKindSchema>;

export const LaunchKitTargetLaneSchema = z.enum([
  'apple-iphone',
  'apple-ipad',
  'google-phone',
  'google-7-tablet',
  'google-10-tablet',
  'google-feature-graphic'
]);
export type LaunchKitTargetLane = z.infer<typeof LaunchKitTargetLaneSchema>;

export const LaunchKitBackgroundFamilySchema = z.enum([
  'solid',
  'gradient',
  'mesh',
  'image'
]);
export type LaunchKitBackgroundFamily = z.infer<
  typeof LaunchKitBackgroundFamilySchema
>;

export const LaunchKitLocaleSchema = z.object({
  code: z.string().min(2),
  label: z.string().min(1).optional(),
  isDefault: z.boolean().default(false)
});
export type LaunchKitLocale = z.infer<typeof LaunchKitLocaleSchema>;

export const LaunchKitAssetSchema = z.object({
  id: z.string().min(1),
  kind: LaunchKitAssetKindSchema,
  name: z.string().min(1),
  mimeType: z.string().min(1).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fileSize: z.number().int().nonnegative().optional()
});
export type LaunchKitAsset = z.infer<typeof LaunchKitAssetSchema>;

export const LaunchKitBrandSchema = z.object({
  appName: z.string().min(1),
  tagline: z.string().optional(),
  iconAssetId: z.string().min(1).optional(),
  primaryColor: z.string().min(1),
  accentColor: z.string().min(1),
  canvasColor: z.string().min(1)
});
export type LaunchKitBrand = z.infer<typeof LaunchKitBrandSchema>;

export const LaunchKitThemeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  backgroundFamily: LaunchKitBackgroundFamilySchema,
  backgroundPresetId: z.string().min(1),
  framePresetId: z.string().min(1),
  typographyPresetId: z.string().min(1),
  shadowPresetId: z.string().min(1),
  cornerRadius: z.number().min(0).max(96)
});
export type LaunchKitTheme = z.infer<typeof LaunchKitThemeSchema>;

export const LaunchKitSlideCopySchema = z.object({
  eyebrow: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  ctaLabel: z.string().optional()
});
export type LaunchKitSlideCopy = z.infer<typeof LaunchKitSlideCopySchema>;

export const LaunchKitSlideSchema = z.object({
  id: z.string().min(1),
  sourceAssetId: z.string().min(1),
  layoutPresetId: z.string().min(1),
  framePresetId: z.string().min(1).optional(),
  backgroundPresetId: z.string().min(1).optional(),
  contentByLocale: z.record(z.string(), LaunchKitSlideCopySchema)
});
export type LaunchKitSlide = z.infer<typeof LaunchKitSlideSchema>;

export const LaunchKitProjectSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  defaultLocale: z.string().min(2),
  locales: z.array(LaunchKitLocaleSchema).min(1),
  targets: z.array(LaunchKitTargetLaneSchema).min(1),
  assets: z.array(LaunchKitAssetSchema),
  slides: z.array(LaunchKitSlideSchema),
  brand: LaunchKitBrandSchema,
  theme: LaunchKitThemeSchema
});
export type LaunchKitProject = z.infer<typeof LaunchKitProjectSchema>;

export const DEFAULT_LAUNCH_KIT_BRAND: LaunchKitBrand = {
  appName: 'Untitled App',
  tagline: undefined,
  iconAssetId: undefined,
  primaryColor: '#f5f5f7',
  accentColor: '#7c5cff',
  canvasColor: '#0b0b10'
};

export const DEFAULT_LAUNCH_KIT_THEME: LaunchKitTheme = {
  id: 'default-clean',
  name: 'Default Clean',
  backgroundFamily: 'gradient',
  backgroundPresetId: 'aurora-slate',
  framePresetId: 'iphone-dark',
  typographyPresetId: 'editorial-sans',
  shadowPresetId: 'soft-float',
  cornerRadius: 28
};

export function createLaunchKitProject({
  id = 'launch-kit-project',
  name = 'Launch Kit',
  appName = DEFAULT_LAUNCH_KIT_BRAND.appName
}: {
  id?: string;
  name?: string;
  appName?: string;
} = {}): LaunchKitProject {
  const now = new Date().toISOString();

  return {
    version: 1,
    id,
    name,
    createdAt: now,
    updatedAt: now,
    defaultLocale: 'en-US',
    locales: [{ code: 'en-US', label: 'English (US)', isDefault: true }],
    targets: ['apple-iphone', 'google-phone'],
    assets: [],
    slides: [],
    brand: {
      ...DEFAULT_LAUNCH_KIT_BRAND,
      appName
    },
    theme: DEFAULT_LAUNCH_KIT_THEME
  };
}
