import type { MantleCard } from '@mantle/schemas/model';

import { resolveBackgroundGenerator } from '../backgrounds';
import type { MantleCanvasRenderingContext2D } from '../canvas';
import type { MantleRenderMode } from '../types';
import { getAssetSource, type MantleRenderableAsset } from './assets';
import {
  drawEmptyScreenshotPlaceholder,
  drawImageWithShadowedFrame
} from './frameSurface';
import { withLoadedImage, type LoadedMantleImage } from './imageCache';
import type { MantleSceneLayout } from './sceneLayout';
import { drawTextBlock } from './text';

export type MantleFrameSurfaceRender = {
  contentRect: MantleSceneLayout['canvasRect'];
  frameRect: MantleSceneLayout['canvasRect'];
  baseFrameRect: MantleSceneLayout['canvasRect'];
  frameRotation: number;
};

function imageDimension(
  image: LoadedMantleImage,
  axis: 'width' | 'height'
): number {
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
  ctx: MantleCanvasRenderingContext2D,
  image: LoadedMantleImage,
  rect: MantleSceneLayout['canvasRect']
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

function withFrameRotation<T>(
  ctx: MantleCanvasRenderingContext2D,
  layout: MantleSceneLayout,
  draw: () => T
): T {
  if (layout.frameRotation === 0) return draw();

  const centerX = layout.imageRect.x + layout.imageRect.width / 2;
  const centerY = layout.imageRect.y + layout.imageRect.height / 2;
  ctx.save();
  try {
    ctx.translate(centerX, centerY);
    ctx.rotate((layout.frameRotation * Math.PI) / 180);
    ctx.translate(-centerX, -centerY);
    return draw();
  } finally {
    ctx.restore();
  }
}

export async function drawMantleBackground({
  ctx,
  card,
  backgroundAsset,
  layout,
  renderMode
}: {
  ctx: MantleCanvasRenderingContext2D;
  card: MantleCard;
  backgroundAsset?: MantleRenderableAsset | undefined;
  layout: MantleSceneLayout;
  renderMode: MantleRenderMode;
}): Promise<void> {
  const palette = layout.palette;

  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, layout.canvasRect.width, layout.canvasRect.height);

  const generator = resolveBackgroundGenerator(card.background.presetId);
  await generator({
    ctx,
    rect: layout.canvasRect,
    palette,
    colors: card.background.colors,
    intensity: card.background.intensity,
    params: card.background.params ?? {},
    seed: card.background.seed,
    renderMode,
    scale: layout.drawScale
  });

  if (card.background.presetId === 'image-fill') {
    const source = getAssetSource(backgroundAsset);
    if (!source) throw new Error('Could not load background image asset.');
    await withLoadedImage(source, (image) => {
      drawCoverImage(ctx, image, layout.canvasRect);
    });
  }
}

export async function drawMantleFrameSurface({
  ctx,
  card,
  asset,
  layout,
  showEmptyPlaceholderText
}: {
  ctx: MantleCanvasRenderingContext2D;
  card: MantleCard;
  asset?: MantleRenderableAsset | undefined;
  layout: MantleSceneLayout;
  showEmptyPlaceholderText: boolean;
}): Promise<MantleFrameSurfaceRender> {
  const assetSource = getAssetSource(asset);

  if (assetSource) {
    let contentRect: MantleFrameSurfaceRender['contentRect'] | undefined;
    await withLoadedImage(assetSource, (image) => {
      contentRect = withFrameRotation(ctx, layout, () =>
        drawImageWithShadowedFrame(
          ctx,
          image,
          layout.imageRect,
          layout.cornerRadius,
          layout.contentPadding,
          card,
          layout.palette,
          layout.canvasRect.width
        )
      );
    });
    return {
      contentRect: contentRect ?? layout.imageRect,
      frameRect: layout.imageRect,
      baseFrameRect: layout.baseImageRect,
      frameRotation: layout.frameRotation
    };
  }

  return {
    contentRect: withFrameRotation(ctx, layout, () =>
      drawEmptyScreenshotPlaceholder(
        ctx,
        layout.imageRect,
        layout.cornerRadius,
        layout.contentPadding,
        card,
        layout.palette,
        layout.canvasRect.width,
        showEmptyPlaceholderText
      )
    ),
    frameRect: layout.imageRect,
    baseFrameRect: layout.baseImageRect,
    frameRotation: layout.frameRotation
  };
}

export function drawMantleText({
  ctx,
  layout
}: {
  ctx: MantleCanvasRenderingContext2D;
  layout: MantleSceneLayout;
}): void {
  if (!layout.textDraw) return;

  drawTextBlock({
    ctx,
    layout: layout.textDraw.layout,
    x: layout.textDraw.x,
    y: layout.textDraw.y,
    align: layout.textDraw.align
  });
}
