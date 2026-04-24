import { SourceDescriptorSchema, type SourceDescriptor } from '@glyphrame/schemas';

import type { PreviewSourceImage } from '../runtime/sessionState';

export type SourceInput = {
  blob: Blob;
  name?: string;
  mimeType?: string;
};

export type LoadedSourceAsset = {
  bitmap: PreviewSourceImage | null;
  descriptor: SourceDescriptor;
  dispose: () => void;
};

function inferFormat(input: SourceInput): string {
  const mimeType = input.mimeType ?? input.blob.type;

  if (mimeType.includes('/')) {
    return mimeType.split('/')[1] ?? 'unknown';
  }

  const fileName = input.name ?? '';
  const dotIndex = fileName.lastIndexOf('.');

  if (dotIndex >= 0) {
    return fileName.slice(dotIndex + 1).toLowerCase();
  }

  return 'unknown';
}

function inferType(format: string): SourceDescriptor['type'] {
  return format === 'gif' ? 'gif' : 'image';
}

async function createImageElement(blob: Blob): Promise<{
  image: HTMLImageElement | null;
  dispose: () => void;
}> {
  if (typeof Image === 'undefined' || typeof URL === 'undefined') {
    return {
      image: null,
      dispose: () => {}
    };
  }

  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error('Failed to decode image element.'));
      nextImage.src = objectUrl;
    });

    return {
      image,
      dispose: () => URL.revokeObjectURL(objectUrl)
    };
  } catch {
    URL.revokeObjectURL(objectUrl);
    throw new Error('Failed to decode source image.');
  }
}

async function createSourceBitmap(blob: Blob): Promise<{
  bitmap: PreviewSourceImage | null;
  width: number;
  height: number;
  dispose: () => void;
}> {
  if (typeof createImageBitmap !== 'undefined') {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: () => bitmap.close()
      };
    } catch {
      // Fall through to the image-element decoder below.
    }
  }

  const decoded = await createImageElement(blob);

  return {
    bitmap: decoded.image,
    width: decoded.image?.naturalWidth ?? decoded.image?.width ?? 0,
    height: decoded.image?.naturalHeight ?? decoded.image?.height ?? 0,
    dispose: decoded.dispose
  };
}

function createSourceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `source-${Date.now()}`;
}

export async function loadSourceAsset(input: SourceInput): Promise<LoadedSourceAsset> {
  const warnings: string[] = [];
  const format = inferFormat(input);
  const type = inferType(format);
  let bitmap: PreviewSourceImage | null = null;
  let dispose = () => {};

  let width = 0;
  let height = 0;

  try {
    const decoded = await createSourceBitmap(input.blob);
    bitmap = decoded.bitmap;
    width = decoded.width;
    height = decoded.height;
    dispose = decoded.dispose;
  } catch {
    warnings.push('Image decode fell back to limited metadata in this browser.');
  }

  if (type === 'gif') {
    warnings.push('GIF timing metadata is planned for a later milestone.');
  }

  return {
    bitmap,
    dispose,
    descriptor: SourceDescriptorSchema.parse({
      id: createSourceId(),
      name: input.name ?? 'Untitled source',
      type,
      format,
      width,
      height,
      fileSize: input.blob.size,
      warnings
    })
  };
}

export async function loadSourceDescriptor(
  input: SourceInput
): Promise<SourceDescriptor> {
  const loaded = await loadSourceAsset(input);
  loaded.dispose();
  return loaded.descriptor;
}
