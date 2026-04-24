import {
  ExportOptionsSchema,
  type ExportOptions,
  type ExportResult
} from '@glyphrame/schemas';

import { renderPreviewScene } from '../preview/renderPreviewScene';
import type { EngineSessionState } from '../runtime/sessionState';

type ExportContext = {
  previewTarget: HTMLCanvasElement;
  state: EngineSessionState;
};

type ExportCanvasSize = {
  width: number;
  height: number;
};

async function rasterizeCanvas(
  canvas: HTMLCanvasElement,
  format: 'png' | 'jpeg' | 'webp',
  quality?: number
): Promise<Blob> {
  const mimeType = format === 'png' ? 'image/png' : `image/${format}`;

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });

  if (!blob) {
    throw new Error(`Unable to create ${format.toUpperCase()} export blob.`);
  }

  return blob;
}

function getExportCanvasSize(context: ExportContext): ExportCanvasSize {
  const sourceWidth = context.state.source?.width ?? 0;
  const sourceHeight = context.state.source?.height ?? 0;
  const fallbackWidth = Math.max(1, context.previewTarget.width || 960);
  const fallbackHeight = Math.max(1, context.previewTarget.height || 640);
  const width = sourceWidth > 0 ? sourceWidth : fallbackWidth;
  const height = sourceHeight > 0 ? sourceHeight : fallbackHeight;
  const maxDimension = 4096;
  const scale = Math.min(1, maxDimension / Math.max(width, height));

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

export async function exportPlaceholderResult(
  rawOptions: ExportOptions,
  context: ExportContext
): Promise<ExportResult> {
  const options = ExportOptionsSchema.parse(rawOptions);
  const sourceName = context.state.source?.name.replace(/\.[^.]+$/, '') ?? 'glyphrame';
  const exportCanvas = document.createElement('canvas');
  const baseSize = getExportCanvasSize(context);

  if (options.format === 'txt') {
    const result = renderPreviewScene(exportCanvas, context.state, {
      frameStyle: 'export',
      mode: 'final',
      sceneBackground: context.state.conversionSettings.backgroundColor,
      width: baseSize.width,
      height: baseSize.height
    });
    const text = result.textLines.length
      ? result.textLines.join('\n')
      : ['ASCII LAB EXPORT PLACEHOLDER', '', 'No ASCII frame has been rendered yet.'].join('\n');

    context.state.asciiTextLines = result.textLines;

    return {
      blob: new Blob([text], { type: 'text/plain;charset=utf-8' }),
      filename: `${sourceName}.txt`,
      mimeType: 'text/plain'
    };
  }

  if (options.format === 'gif') {
    throw new Error('GIF export is planned for a later milestone.');
  }

  renderPreviewScene(exportCanvas, context.state, {
    frameStyle: 'export',
    mode: 'final',
    sceneBackground: context.state.conversionSettings.backgroundColor,
    width: baseSize.width * options.scale,
    height: baseSize.height * options.scale
  });

  const blob = await rasterizeCanvas(exportCanvas, options.format, options.quality);
  const mimeType = options.format === 'png' ? 'image/png' : `image/${options.format}`;

  return {
    blob,
    filename: `${sourceName}.${options.format}`,
    mimeType
  };
}
