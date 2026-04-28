import * as z from 'zod';

import { MantleAssetSchema } from './asset';
import { MantleBrandSchema } from './brand';
import { MantleCardSchema } from './card';
import { MantleSurfaceTargetSchema } from './target';
import { MantleThemeSchema } from './theme';
export type { MantleProject, MantleRuntimeProject } from './model';

export const MantleProjectSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  activeCardId: z.string().min(1),
  assets: z.array(MantleAssetSchema),
  cards: z.array(MantleCardSchema).min(1),
  targets: z.array(MantleSurfaceTargetSchema).min(1),
  brand: MantleBrandSchema,
  themes: z.array(MantleThemeSchema).min(1)
}).strict().superRefine((project, ctx) => {
  const assetIds = new Set(project.assets.map((asset) => asset.id));
  const cardIds = new Set(project.cards.map((card) => card.id));
  const targetIds = new Set(project.targets.map((target) => target.id));
  const themeIds = new Set(project.themes.map((theme) => theme.id));

  const reportDuplicates = (
    ids: string[],
    path: 'assets' | 'cards' | 'targets' | 'themes'
  ) => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    ids.forEach((id) => {
      if (seen.has(id)) duplicates.add(id);
      seen.add(id);
    });

    duplicates.forEach((id) => {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [path],
        message: `Duplicate ${path} id "${id}".`
      });
    });
  };

  reportDuplicates(project.assets.map((asset) => asset.id), 'assets');
  reportDuplicates(project.cards.map((card) => card.id), 'cards');
  reportDuplicates(project.targets.map((target) => target.id), 'targets');
  reportDuplicates(project.themes.map((theme) => theme.id), 'themes');

  if (!cardIds.has(project.activeCardId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['activeCardId'],
      message: `activeCardId "${project.activeCardId}" does not point to an existing card.`
    });
  }

  if (project.brand.logoAssetId && !assetIds.has(project.brand.logoAssetId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['brand', 'logoAssetId'],
      message: `Brand logoAssetId "${project.brand.logoAssetId}" does not point to an existing asset.`
    });
  }

  project.cards.forEach((card, index) => {
    if (!targetIds.has(card.targetId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cards', index, 'targetId'],
        message: `Card targetId "${card.targetId}" does not point to an existing target.`
      });
    }

    if (!themeIds.has(card.themeId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cards', index, 'themeId'],
        message: `Card themeId "${card.themeId}" does not point to an existing theme.`
      });
    }

    if (card.sourceAssetId && !assetIds.has(card.sourceAssetId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cards', index, 'sourceAssetId'],
        message: `Card sourceAssetId "${card.sourceAssetId}" does not point to an existing asset.`
      });
    }

    if (card.background.imageAssetId && !assetIds.has(card.background.imageAssetId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cards', index, 'background', 'imageAssetId'],
        message: `Card background imageAssetId "${card.background.imageAssetId}" does not point to an existing asset.`
      });
    }
  });
});
