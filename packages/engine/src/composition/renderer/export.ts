import type { MantleExportFormat } from '@mantle/schemas/model';

import type { MantleCanvas } from '../canvas';

const EXPORT_MIME_TYPES: Record<MantleExportFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp'
};

const EXPORT_EXTENSIONS: Record<MantleExportFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp'
};

export function mimeTypeForExportFormat(format: MantleExportFormat): string {
  return EXPORT_MIME_TYPES[format];
}

export function extensionForExportFormat(format: MantleExportFormat): string {
  return EXPORT_EXTENSIONS[format];
}

export function safeExportFileName(name: string): string {
  const baseName = name.replace(/\.(png|jpe?g|webp)$/i, '');

  return (
    baseName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'mantle-card'
  );
}

export async function rasterizeCanvas(
  canvas: MantleCanvas,
  format: MantleExportFormat,
  quality?: number
): Promise<Blob> {
  const mimeType = mimeTypeForExportFormat(format);
  if ('convertToBlob' in canvas) {
    const blob = await canvas.convertToBlob(
      quality == null ? { type: mimeType } : { type: mimeType, quality }
    );
    if (blob.type && blob.type !== mimeType) {
      throw new Error(`${format.toUpperCase()} export is not supported by this browser.`);
    }
    return blob;
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`Unable to create ${format.toUpperCase()} export blob.`));
          return;
        }
        if (blob.type && blob.type !== mimeType) {
          reject(new Error(`${format.toUpperCase()} export is not supported by this browser.`));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

export async function transferCanvasToImageBitmap(
  canvas: MantleCanvas
): Promise<ImageBitmap> {
  if ('transferToImageBitmap' in canvas) {
    return canvas.transferToImageBitmap();
  }

  if (typeof createImageBitmap === 'undefined') {
    throw new Error('ImageBitmap transfer is not available in this environment.');
  }

  return createImageBitmap(canvas);
}
