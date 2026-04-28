import { clearMantleImageCache } from '@mantle/engine/render';
import type { MantleRuntimeAsset as RuntimeMantleAsset } from '@mantle/schemas/model';

export function readImageDimensions(
  sourceUrl: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    });
    image.addEventListener('error', () => reject(new Error('Could not decode image.')));
    image.src = sourceUrl;
  });
}

export function fileBaseName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'Screenshot';
}

function createAssetId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `asset-${crypto.randomUUID()}`
    : `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createAssetFromFile(
  file: File,
  objectUrl: string,
  dimensions: { width: number; height: number }
): RuntimeMantleAsset {
  return {
    id: createAssetId(),
    role: 'screenshot',
    name: file.name,
    mimeType: file.type || 'image/png',
    width: dimensions.width,
    height: dimensions.height,
    fileSize: file.size,
    objectUrl
  };
}

export function hasRenderableAssetSource(
  asset: RuntimeMantleAsset | undefined
): boolean {
  return Boolean(asset?.objectUrl);
}

export function revokeRuntimeObjectUrl(url: string): void {
  clearMantleImageCache(url);
  URL.revokeObjectURL(url);
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
