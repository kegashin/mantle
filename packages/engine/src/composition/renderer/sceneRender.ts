import type { MantleCard } from '@mantle/schemas/model';
import {
  MANTLE_BACKGROUND_ANIMATION_SPEED_DEFAULT,
  MANTLE_BACKGROUND_ANIMATION_SPEED_MAX,
  MANTLE_BACKGROUND_ANIMATION_SPEED_MIN
} from '@mantle/schemas/model';

import { resolveBackgroundGenerator } from '../backgrounds';
import type { MantleCanvasRenderingContext2D } from '../canvas';
import type { MantleRenderMode } from '../types';
import {
  getAssetSource,
  type MantleRenderableAsset,
  type MantleRuntimeFrameSource
} from './assets';
import {
  drawEmptyScreenshotPlaceholder,
  drawFrameContentStroke,
  drawFrameSurfaceScaffold,
  drawImageWithShadowedFrame,
  drawSourceIntoFrameContent,
  type FrameContentSurface
} from './frameSurface';
import { withLoadedImage, type LoadedMantleImage } from './imageCache';
import type { MantleSceneLayout } from './sceneLayout';
import { drawTextBlock } from './text';

export type MantleFrameSurfaceRender = {
  contentRect: MantleSceneLayout['canvasRect'];
  contentRadius: number;
  contentCornerStyle: 'all' | 'bottom' | 'none';
  frameRect: MantleSceneLayout['canvasRect'];
  baseFrameRect: MantleSceneLayout['canvasRect'];
  frameRotation: number;
};

function toFrameSurfaceRender(
  surface: FrameContentSurface,
  layout: MantleSceneLayout
): MantleFrameSurfaceRender {
  return {
    contentRect: surface.contentRect,
    contentRadius: surface.contentRadius,
    contentCornerStyle: surface.contentCornerStyle,
    frameRect: layout.imageRect,
    baseFrameRect: layout.baseImageRect,
    frameRotation: layout.frameRotation
  };
}

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

function resolveBackgroundAnimationTime(card: MantleCard, timeMs: number): number {
  const speed =
    card.background.animation?.speed ?? MANTLE_BACKGROUND_ANIMATION_SPEED_DEFAULT;
  const safeSpeed = Math.min(
    MANTLE_BACKGROUND_ANIMATION_SPEED_MAX,
    Math.max(MANTLE_BACKGROUND_ANIMATION_SPEED_MIN, speed)
  );
  return Math.max(0, timeMs) * safeSpeed;
}

export async function drawMantleBackground({
  ctx,
  card,
  backgroundAsset,
  layout,
  renderMode,
  timeMs = 0
}: {
  ctx: MantleCanvasRenderingContext2D;
  card: MantleCard;
  backgroundAsset?: MantleRenderableAsset | undefined;
  layout: MantleSceneLayout;
  renderMode: MantleRenderMode;
  timeMs?: number | undefined;
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
    timeMs: resolveBackgroundAnimationTime(card, timeMs),
    scale: layout.drawScale
  });

  if (card.background.presetId === 'image-fill') {
    const source = getAssetSource(backgroundAsset);
    if (!source) throw new Error('Could not load background image asset.');
    if (backgroundAsset?.mediaKind === 'video') {
      throw new Error('Video backdrops are unavailable in the static renderer.');
    }
    await withLoadedImage(source, (image) => {
      drawCoverImage(ctx, image, layout.canvasRect);
    });
  }
}

export async function drawMantleFrameSurface({
  ctx,
  card,
  asset,
  sourceFrame,
  layout,
  showEmptyPlaceholderText
}: {
  ctx: MantleCanvasRenderingContext2D;
  card: MantleCard;
  asset?: MantleRenderableAsset | undefined;
  sourceFrame?: MantleRuntimeFrameSource | undefined;
  layout: MantleSceneLayout;
  showEmptyPlaceholderText: boolean;
}): Promise<MantleFrameSurfaceRender> {
  const assetSource = getAssetSource(asset);

  if (assetSource) {
    if (asset?.mediaKind === 'video') {
      if (!sourceFrame) {
        const contentSurface = withFrameRotation(ctx, layout, () =>
          drawEmptyScreenshotPlaceholder(
            ctx,
            layout.imageRect,
            layout.cornerRadius,
            layout.contentPadding,
            card,
            layout.palette,
            layout.canvasRect.width,
            false
          )
        );

        return {
          contentRect: contentSurface.contentRect,
          contentRadius: contentSurface.contentRadius,
          contentCornerStyle: contentSurface.contentCornerStyle,
          frameRect: layout.imageRect,
          baseFrameRect: layout.baseImageRect,
          frameRotation: layout.frameRotation
        };
      }

      let contentSurface:
        | Pick<
            MantleFrameSurfaceRender,
            'contentRect' | 'contentRadius' | 'contentCornerStyle'
          >
        | undefined;
      withFrameRotation(ctx, layout, () => {
        contentSurface = drawFrameSurfaceScaffold(
          ctx,
          layout.imageRect,
          layout.cornerRadius,
          layout.contentPadding,
          card,
          layout.palette,
          layout.canvasRect.width
        );
        drawSourceIntoFrameContent(
          ctx,
          {
            source: sourceFrame.source,
            width: sourceFrame.width,
            height: sourceFrame.height
          },
          contentSurface,
          card
        );
        drawFrameContentStroke(
          ctx,
          contentSurface,
          card,
          layout.palette,
          layout.canvasRect.width
        );
      });

      return {
        contentRect: contentSurface?.contentRect ?? layout.imageRect,
        contentRadius: contentSurface?.contentRadius ?? layout.cornerRadius,
        contentCornerStyle: contentSurface?.contentCornerStyle ?? 'all',
        frameRect: layout.imageRect,
        baseFrameRect: layout.baseImageRect,
        frameRotation: layout.frameRotation
      };
    }

    let contentSurface:
      | Pick<
          MantleFrameSurfaceRender,
          'contentRect' | 'contentRadius' | 'contentCornerStyle'
        >
      | undefined;
    await withLoadedImage(assetSource, (image) => {
      contentSurface = withFrameRotation(ctx, layout, () =>
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
      contentRect: contentSurface?.contentRect ?? layout.imageRect,
      contentRadius: contentSurface?.contentRadius ?? layout.cornerRadius,
      contentCornerStyle: contentSurface?.contentCornerStyle ?? 'all',
      frameRect: layout.imageRect,
      baseFrameRect: layout.baseImageRect,
      frameRotation: layout.frameRotation
    };
  }

  const contentSurface = withFrameRotation(ctx, layout, () =>
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
  );

  return {
    contentRect: contentSurface.contentRect,
    contentRadius: contentSurface.contentRadius,
    contentCornerStyle: contentSurface.contentCornerStyle,
    frameRect: layout.imageRect,
    baseFrameRect: layout.baseImageRect,
    frameRotation: layout.frameRotation
  };
}

export function drawMantleFrameScaffold({
  ctx,
  card,
  layout
}: {
  ctx: MantleCanvasRenderingContext2D;
  card: MantleCard;
  layout: MantleSceneLayout;
}): MantleFrameSurfaceRender {
  const surface = withFrameRotation(ctx, layout, () =>
    drawFrameSurfaceScaffold(
      ctx,
      layout.imageRect,
      layout.cornerRadius,
      layout.contentPadding,
      card,
      layout.palette,
      layout.canvasRect.width
    )
  );
  return toFrameSurfaceRender(surface, layout);
}

export function drawMantleSourceFrame({
  ctx,
  card,
  sourceFrame,
  frameSurface,
  layout
}: {
  ctx: MantleCanvasRenderingContext2D;
  card: MantleCard;
  sourceFrame: MantleRuntimeFrameSource;
  frameSurface: Pick<
    MantleFrameSurfaceRender,
    'contentRect' | 'contentRadius' | 'contentCornerStyle'
  >;
  layout: MantleSceneLayout;
}): void {
  withFrameRotation(ctx, layout, () => {
    drawSourceIntoFrameContent(
      ctx,
      {
        source: sourceFrame.source,
        width: sourceFrame.width,
        height: sourceFrame.height
      },
      frameSurface,
      card
    );
  });
}

export function drawMantleFrameStroke({
  ctx,
  card,
  frameSurface,
  layout
}: {
  ctx: MantleCanvasRenderingContext2D;
  card: MantleCard;
  frameSurface: Pick<
    MantleFrameSurfaceRender,
    'contentRect' | 'contentRadius' | 'contentCornerStyle'
  >;
  layout: MantleSceneLayout;
}): void {
  withFrameRotation(ctx, layout, () => {
    drawFrameContentStroke(
      ctx,
      frameSurface,
      card,
      layout.palette,
      layout.canvasRect.width
    );
  });
}

export function drawMantleText({
  ctx,
  layout,
  hiddenTextLayerIds = []
}: {
  ctx: MantleCanvasRenderingContext2D;
  layout: MantleSceneLayout;
  hiddenTextLayerIds?: string[] | undefined;
}): void {
  const hiddenLayerIds = new Set(hiddenTextLayerIds);
  const drawText = (textDraw: NonNullable<MantleSceneLayout['textDraw']>) => {
    const draw = () =>
    drawTextBlock({
      ctx,
      layout: textDraw.layout,
      x: textDraw.x,
      y: textDraw.y,
      align: textDraw.align
    });

    if (textDraw.rotation === 0) {
      draw();
      return;
    }

    const centerX = textDraw.x + textDraw.layout.width / 2;
    const centerY = textDraw.y + textDraw.layout.height / 2;

    ctx.save();
    try {
      ctx.translate(centerX, centerY);
      ctx.rotate((textDraw.rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
      draw();
    } finally {
      ctx.restore();
    }
  };

  if (layout.textDraw) drawText(layout.textDraw);
  layout.textLayerDraws.forEach((textDraw) => {
    if (hiddenLayerIds.has(textDraw.layerId)) return;
    drawText(textDraw);
  });
}
