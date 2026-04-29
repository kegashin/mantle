import type {
  ExportResult,
  MantleCard,
  MantleSurfaceTarget
} from '@mantle/schemas/model';

import { resolveFrameBoxStyle } from './frames';
import {
  MAX_MANTLE_RENDER_WORKING_BYTES,
  estimateRgbaBufferBytes,
  formatMemoryMegabytes
} from './memoryBudget';
import {
  createCanvas,
  getCanvas2D,
  releaseScratchCanvas,
  resetCanvasBitmap,
  type MantleCanvas
} from './canvas';
import {
  extensionForExportFormat,
  mimeTypeForExportFormat,
  rasterizeCanvas,
  safeExportFileName
} from './renderer/export';
import type { MantleRenderableAsset } from './renderer/assets';
import { resolveMantleSceneLayout } from './renderer/sceneLayout';
import {
  drawMantleBackground,
  drawMantleFrameSurface,
  drawMantleText
} from './renderer/sceneRender';
import type { MantleRenderMode } from './types';

export type { MantleCanvas } from './canvas';
export type { MantleRenderMode } from './types';
export { rasterizeCanvas, transferCanvasToImageBitmap } from './renderer/export';
export {
  clearMantleImageCache,
} from './renderer/imageCache';
export type { MantleRenderableAsset } from './renderer/assets';

const MAX_MANTLE_RENDER_DIMENSION = 8192;
const MAX_MANTLE_RENDER_PIXELS =
  MAX_MANTLE_RENDER_DIMENSION * MAX_MANTLE_RENDER_DIMENSION;
const SHADER_BACKGROUND_PRESET_IDS = new Set([
  'marbling',
  'signal-field',
  'smoke-veil'
]);

export type MantleRenderInput = {
  card: MantleCard;
  target: MantleSurfaceTarget;
  asset?: MantleRenderableAsset | undefined;
  backgroundAsset?: MantleRenderableAsset | undefined;
  showEmptyPlaceholderText?: boolean | undefined;
  renderMode?: MantleRenderMode | undefined;
  /**
   * Output scale factor. For preview use 0.4..1, for export 1..5.
   * The card is rendered at `target.width * scale` x `target.height * scale`.
   */
  scale?: number | undefined;
  /**
   * Optional existing canvas — when provided, the renderer resizes it and
   * draws into it (used by the reactive preview component). When omitted,
   * a fresh `<canvas>` is created (used by the exporter).
   */
  canvas?: MantleCanvas | undefined;
};

export function resolveMantleRenderSize(
  target: MantleSurfaceTarget,
  requestedScale = 1
): { scale: number; width: number; height: number } {
  const scale = Math.max(0.1, requestedScale);
  const width = Math.round(target.width * scale);
  const height = Math.round(target.height * scale);
  const pixels = width * height;

  if (
    width > MAX_MANTLE_RENDER_DIMENSION ||
    height > MAX_MANTLE_RENDER_DIMENSION ||
    pixels > MAX_MANTLE_RENDER_PIXELS
  ) {
    throw new Error(
      `Output size ${width} × ${height} is too large. Keep exports under ${MAX_MANTLE_RENDER_DIMENSION}px per side.`
    );
  }

  return { scale, width, height };
}

function estimateMantleRenderWorkingBytes(
  card: MantleCard,
  width: number,
  height: number
): number {
  let bytes = estimateRgbaBufferBytes(width, height);
  const boxStyle = resolveFrameBoxStyle(card.frame);

  if (card.background.presetId === 'symbol-wave') {
    bytes += estimateRgbaBufferBytes(width, height);
  }

  if (SHADER_BACKGROUND_PRESET_IDS.has(card.background.presetId)) {
    bytes += estimateRgbaBufferBytes(width, height);
  }

  if ((card.frame.shadowStrength ?? 1) > 0) {
    bytes += estimateRgbaBufferBytes(width, height);
  }

  if (boxStyle === 'glass-panel' && (card.frame.glassBlur ?? 5) > 0) {
    bytes += estimateRgbaBufferBytes(width, height, 4);
  }

  return bytes;
}

export function validateMantleRenderBudget(
  card: MantleCard,
  width: number,
  height: number
): void {
  const estimatedBytes = estimateMantleRenderWorkingBytes(card, width, height);
  if (estimatedBytes <= MAX_MANTLE_RENDER_WORKING_BYTES) return;

  throw new Error(
    `Output effects need about ${formatMemoryMegabytes(estimatedBytes)} of working canvas memory. Keep exports under ${formatMemoryMegabytes(MAX_MANTLE_RENDER_WORKING_BYTES)} by lowering scale, shadow strength, or glass blur.`
  );
}

function ensureCanvas(input: MantleRenderInput, width: number, height: number): MantleCanvas {
  if (input.canvas) {
    if (input.canvas.width !== width) input.canvas.width = width;
    if (input.canvas.height !== height) input.canvas.height = height;
    return input.canvas;
  }
  return createCanvas(width, height);
}

export function resolveMantleExportFileName(
  card: MantleCard,
  asset?: MantleRenderableAsset | undefined
): string {
  const fileName = card.export.fileName?.trim() || asset?.name || card.name;
  return `${safeExportFileName(fileName)}.${extensionForExportFormat(card.export.format)}`;
}

export async function renderMantleCardToCanvas(
  input: MantleRenderInput
): Promise<MantleCanvas> {
  const { scale, width, height } = resolveMantleRenderSize(
    input.target,
    input.scale ?? 1
  );
  validateMantleRenderBudget(input.card, width, height);
  const canvas = ensureCanvas(input, width, height);
  const ctx = getCanvas2D(canvas);
  let renderCompleted = false;

  ctx.save();
  try {
    ctx.clearRect(0, 0, width, height);

    const layout = resolveMantleSceneLayout({
      ctx,
      card: input.card,
      asset: input.asset,
      width,
      height,
      scale
    });
    await drawMantleBackground({
      ctx,
      card: input.card,
      backgroundAsset: input.backgroundAsset,
      layout,
      renderMode: input.renderMode ?? 'export'
    });
    await drawMantleFrameSurface({
      ctx,
      card: input.card,
      asset: input.asset,
      layout,
      showEmptyPlaceholderText: input.showEmptyPlaceholderText ?? true
    });
    drawMantleText({ ctx, layout });

    renderCompleted = true;
    return canvas;
  } finally {
    if (renderCompleted) {
      ctx.restore();
    } else {
      resetCanvasBitmap(canvas);
    }
  }
}

export async function exportMantleCard(
  input: MantleRenderInput
): Promise<ExportResult> {
  const format = input.card.export.format;
  let canvas: MantleCanvas | undefined;

  try {
    canvas = await renderMantleCardToCanvas({
      ...input,
      scale: input.scale ?? input.card.export.scale
    });
    const blob = await rasterizeCanvas(canvas, format, input.card.export.quality);
    const mimeType = mimeTypeForExportFormat(format);

    return {
      blob,
      filename: resolveMantleExportFileName(input.card, input.asset),
      mimeType
    };
  } finally {
    if (canvas && !input.canvas) releaseScratchCanvas(canvas);
  }
}
