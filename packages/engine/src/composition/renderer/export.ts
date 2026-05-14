import type { MantleExportFormat } from '@mantle/schemas/model';

import { getCanvas2D, type MantleCanvas } from '../canvas';
import { encodeStaticGif, MAX_STATIC_GIF_PIXELS } from './staticGif';

type RasterizeCanvasOptions = {
  quality?: number | undefined;
  gifDurationMs?: number | undefined;
  gifLoop?: boolean | undefined;
  gifLoopCount?: number | undefined;
};

const EXPORT_MIME_TYPES: Record<MantleExportFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  webm: 'video/webm',
  mp4: 'video/mp4'
};

const EXPORT_EXTENSIONS: Record<MantleExportFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  gif: 'gif',
  webm: 'webm',
  mp4: 'mp4'
};

export function mimeTypeForExportFormat(format: MantleExportFormat): string {
  return EXPORT_MIME_TYPES[format];
}

export function extensionForExportFormat(format: MantleExportFormat): string {
  return EXPORT_EXTENSIONS[format];
}

export function safeExportFileName(name: string): string {
  const baseName = name.replace(/\.(png|jpe?g|webp|gif|webm|mp4)$/i, '');

  return (
    baseName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'mantle-card'
  );
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function rasterizeCanvas(
  canvas: MantleCanvas,
  format: MantleExportFormat,
  options: RasterizeCanvasOptions = {}
): Promise<Blob> {
  const mimeType = mimeTypeForExportFormat(format);

  if (format === 'gif') {
    if (canvas.width * canvas.height > MAX_STATIC_GIF_PIXELS) {
      throw new Error(
        `GIF export is too large. Keep static GIF exports under ${MAX_STATIC_GIF_PIXELS.toLocaleString('en-US')} pixels by lowering scale or canvas size.`
      );
    }

    const imageData = getCanvas2D(canvas).getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );
    return new Blob([
      bytesToArrayBuffer(
        encodeStaticGif(imageData, {
          delayMs: options.gifDurationMs,
          loop: options.gifLoop,
          loopCount: options.gifLoopCount
        })
      )
    ], { type: mimeType });
  }

  if (format === 'webm' || format === 'mp4') {
    throw new Error(`${format.toUpperCase()} export requires the browser video exporter.`);
  }

  if ('convertToBlob' in canvas) {
    const blob = await canvas.convertToBlob(
      options.quality == null
        ? { type: mimeType }
        : { type: mimeType, quality: options.quality }
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
      options.quality
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
