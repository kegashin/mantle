import type { MantleRenderableAsset } from '@mantle/schemas/model';
export type { MantleRenderableAsset } from '@mantle/schemas/model';

export type MantleRuntimeFrameSource = {
  source: CanvasImageSource;
  width: number;
  height: number;
  timeMs?: number | undefined;
  cacheKey?: string | undefined;
};

export function getAssetSource(
  asset: MantleRenderableAsset | undefined
): string | undefined {
  return asset?.objectUrl;
}
