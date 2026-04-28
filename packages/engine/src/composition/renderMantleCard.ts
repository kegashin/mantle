import type {
  ExportResult,
  MantleCard,
  MantlePalette,
  MantleSurfaceTarget
} from '@mantle/schemas/model';

import { resolveBackgroundGenerator } from './backgrounds';
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
import {
  getAssetSource,
  type MantleRenderableAsset
} from './renderer/assets';
import { withLoadedImage, type LoadedMantleImage } from './renderer/imageCache';
import {
  drawEmptyScreenshotPlaceholder,
  drawImageWithShadowedFrame
} from './renderer/frameSurface';
import { fitFrameRectToAsset } from './renderer/layout';
import {
  createTextBlockLayout,
  drawTextBlock,
  hasVisibleText,
  resolveCardText,
  type TextBlockLayout
} from './renderer/text';
import type { MantleRenderMode, Rect } from './types';

export type { MantleCanvas } from './canvas';
export type { MantleRenderMode } from './types';
export { rasterizeCanvas, transferCanvasToImageBitmap } from './renderer/export';
export {
  clearMantleImageCache,
} from './renderer/imageCache';
export type { MantleRenderableAsset } from './renderer/assets';

const NOMINAL_WIDTH = 1600;
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

function imageDimension(image: LoadedMantleImage, axis: 'width' | 'height'): number {
  const value =
    axis === 'width'
      ? 'naturalWidth' in image
        ? image.naturalWidth
        : image.width
      : 'naturalHeight' in image
        ? image.naturalHeight
        : image.height;
  return typeof value === 'number' ? value : 0;
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  image: LoadedMantleImage,
  rect: Rect
): void {
  const sourceWidth = imageDimension(image, 'width');
  const sourceHeight = imageDimension(image, 'height');
  if (sourceWidth <= 0 || sourceHeight <= 0) return;

  const scale = Math.max(rect.width / sourceWidth, rect.height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const drawX = rect.x + (rect.width - drawWidth) / 2;
  const drawY = rect.y + (rect.height - drawHeight) / 2;

  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
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

    const card = input.card;
    const palette: MantlePalette = card.background.palette;
    const canvasRect: Rect = { x: 0, y: 0, width, height };
    const drawScale = width / NOMINAL_WIDTH;

    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, width, height);

    const generator = resolveBackgroundGenerator(card.background.presetId);
    await generator({
      ctx,
      rect: canvasRect,
      palette,
      colors: card.background.colors,
      intensity: card.background.intensity,
      params: card.background.params ?? {},
      seed: card.background.seed,
      renderMode: input.renderMode ?? 'export',
      scale: drawScale
    });

    if (card.background.presetId === 'image-fill') {
      const source = getAssetSource(input.backgroundAsset);
      if (!source) throw new Error('Could not load background image asset.');
      await withLoadedImage(source, (image) => {
        drawCoverImage(ctx, image, canvasRect);
      });
    }

    const padding = Math.min(card.frame.padding * scale, width * 0.16, height * 0.22);
    const text = resolveCardText(card);
    const showText = hasVisibleText(text);
    const availableRect: Rect = {
      x: padding,
      y: padding,
      width: width - padding * 2,
      height: height - padding * 2
    };
    const textReference = Math.min(width, height * 1.45);
    const textGap = showText ? text.gap * scale : 0;
    // Pull the title/subtitle a small distance from the canvas edge so it
    // doesn't sit flush with the rounded outer frame. ~3% of the shorter
    // canvas dimension matches editorial margins on social cards.
    const edgeInset = showText ? Math.min(width, height) * 0.03 : 0;
    let imageBounds: Rect = { ...availableRect };
    let textDraw:
      | {
          layout: TextBlockLayout;
          x: number;
          y: number;
        }
      | undefined;

    if (showText) {
      if (text.placement === 'top' || text.placement === 'bottom') {
        const textWidth = Math.min(
          availableRect.width,
          Math.max(1, availableRect.width * text.width)
        );
        const layout = createTextBlockLayout({
          ctx,
          text,
          palette,
          maxWidth: textWidth,
          reference: textReference,
          backgroundPresetId: card.background.presetId
        });
        const textX =
          text.align === 'center'
            ? availableRect.x + (availableRect.width - layout.width) / 2
            : text.align === 'right'
              ? availableRect.x + availableRect.width - layout.width
              : availableRect.x;
        const textY =
          text.placement === 'top'
            ? availableRect.y + edgeInset
            : availableRect.y + availableRect.height - layout.height - edgeInset;

        textDraw = { layout, x: textX, y: textY };
        imageBounds =
          text.placement === 'top'
            ? {
                x: availableRect.x,
                y: textY + layout.height + textGap,
                width: availableRect.width,
                height: Math.max(
                  height * 0.25,
                  availableRect.y + availableRect.height - (textY + layout.height + textGap)
                )
              }
            : {
                x: availableRect.x,
                y: availableRect.y,
                width: availableRect.width,
                height: Math.max(height * 0.25, textY - textGap - availableRect.y)
              };
      } else if (text.placement === 'left' || text.placement === 'right') {
        const textWidth = Math.min(
          availableRect.width * 0.52,
          Math.max(1, availableRect.width * text.width)
        );
        const layout = createTextBlockLayout({
          ctx,
          text,
          palette,
          maxWidth: textWidth,
          reference: textReference,
          backgroundPresetId: card.background.presetId
        });
        const textX =
          text.placement === 'left'
            ? availableRect.x + edgeInset
            : availableRect.x + availableRect.width - layout.width - edgeInset;
        const textY = availableRect.y + (availableRect.height - layout.height) / 2;

        textDraw = { layout, x: textX, y: textY };
        imageBounds =
          text.placement === 'left'
            ? {
                x: textX + layout.width + textGap,
                y: availableRect.y,
                width: Math.max(
                  width * 0.25,
                  availableRect.x + availableRect.width - (textX + layout.width + textGap)
                ),
                height: availableRect.height
              }
            : {
                x: availableRect.x,
                y: availableRect.y,
                width: Math.max(width * 0.25, textX - textGap - availableRect.x),
                height: availableRect.height
              };
      }
    }

    const cornerRadius = card.frame.cornerRadius * scale;
    const contentPadding = (card.frame.contentPadding ?? 0) * scale;
    const imageRect = fitFrameRectToAsset({
      bounds: imageBounds,
      asset: input.asset,
      card,
      cardWidth: width,
      contentPadding
    });

    const assetSource = getAssetSource(input.asset);

    if (assetSource) {
      await withLoadedImage(assetSource, (image) => {
        drawImageWithShadowedFrame(
          ctx,
          image,
          imageRect,
          cornerRadius,
          contentPadding,
          card,
          palette,
          width
        );
      });
    } else {
      drawEmptyScreenshotPlaceholder(
        ctx,
        imageRect,
        cornerRadius,
        contentPadding,
        card,
        palette,
        width,
        input.showEmptyPlaceholderText ?? true
      );
    }

    if (textDraw) {
      drawTextBlock({
        ctx,
        layout: textDraw.layout,
        x: textDraw.x,
        y: textDraw.y,
        align: text.align
      });
    }

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
      filename: `${safeExportFileName(input.card.name)}.${extensionForExportFormat(format)}`,
      mimeType
    };
  } finally {
    if (canvas && !input.canvas) releaseScratchCanvas(canvas);
  }
}
