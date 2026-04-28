import type { MantleRenderableAsset } from '@mantle/schemas/model';
export type { MantleRenderableAsset } from '@mantle/schemas/model';

export function getAssetSource(
  asset: MantleRenderableAsset | undefined
): string | undefined {
  return asset?.objectUrl;
}
