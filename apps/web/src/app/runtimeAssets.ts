import { clearMantleImageCache } from '@mantle/engine/render';
import type {
  MantleAssetRole,
  MantleRuntimeAsset as RuntimeMantleAsset
} from '@mantle/schemas/model';

export type AssetDimensions = {
  width: number;
  height: number;
};

export type VideoMetadata = AssetDimensions & {
  durationMs: number;
};

export function readImageDimensions(
  sourceUrl: string
): Promise<AssetDimensions> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    });
    image.addEventListener('error', () => reject(new Error('Could not decode image.')));
    image.src = sourceUrl;
  });
}

export function readVideoMetadata(sourceUrl: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
    };

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.addEventListener(
      'loadedmetadata',
      () => {
        const width = video.videoWidth;
        const height = video.videoHeight;
        const durationMs = video.duration * 1000;
        cleanup();

        if (
          !Number.isFinite(width) ||
          !Number.isFinite(height) ||
          !Number.isFinite(durationMs) ||
          width <= 0 ||
          height <= 0 ||
          durationMs < 0
        ) {
          reject(new Error('Could not read video metadata.'));
          return;
        }

        resolve({ width, height, durationMs });
      },
      { once: true }
    );
    video.addEventListener(
      'error',
      () => {
        cleanup();
        reject(new Error('Could not decode video metadata.'));
      },
      { once: true }
    );
    video.src = sourceUrl;
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
  dimensions: AssetDimensions,
  role: MantleAssetRole = 'screenshot'
): RuntimeMantleAsset {
  return {
    id: createAssetId(),
    role,
    name: file.name,
    mimeType: file.type || 'image/png',
    mediaKind: 'image',
    width: dimensions.width,
    height: dimensions.height,
    fileSize: file.size,
    objectUrl
  };
}

export function createVideoAssetFromFile(
  file: File,
  objectUrl: string,
  metadata: VideoMetadata,
  role: MantleAssetRole = 'screenshot'
): RuntimeMantleAsset {
  return {
    id: createAssetId(),
    role,
    name: file.name,
    mimeType: file.type || 'video/mp4',
    mediaKind: 'video',
    width: metadata.width,
    height: metadata.height,
    durationMs: metadata.durationMs,
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
