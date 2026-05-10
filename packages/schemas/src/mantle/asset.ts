import * as z from 'zod';

import { MANTLE_ASSET_MEDIA_KINDS, MANTLE_ASSET_ROLES } from './model';
export type {
  MantleAsset,
  MantleAssetMediaKind,
  MantleAssetRole
} from './model';
export type { MantleRenderableAsset, MantleRuntimeAsset } from './model';

export const MantleAssetRoleSchema = z.enum(MANTLE_ASSET_ROLES);
export const MantleAssetMediaKindSchema = z.enum(MANTLE_ASSET_MEDIA_KINDS);

export const MantleAssetSchema = z.object({
  id: z.string().min(1),
  role: MantleAssetRoleSchema,
  name: z.string().min(1),
  mimeType: z.string().min(1).optional(),
  mediaKind: MantleAssetMediaKindSchema.optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fileSize: z.number().int().nonnegative().optional(),
  durationMs: z.number().nonnegative().optional(),
  frameRate: z.number().positive().optional(),
  sourcePath: z.string().min(1).optional()
}).strict();
