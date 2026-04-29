import type {
  MantleCard,
  MantlePalette,
  MantleRenderableAsset,
  MantleText
} from '@mantle/schemas/model';

import type { MantleCanvasRenderingContext2D } from '../canvas';
import type { Rect } from '../types';
import {
  applyFrameTransformToRect,
  resolveFrameTransform
} from './frameTransform';
import { fitFrameRectToAsset } from './layout';
import {
  createTextBlockLayout,
  hasVisibleText,
  resolveCardText,
  type TextBlockLayout
} from './text';

const NOMINAL_WIDTH = 1600;

export type MantleTextDraw = {
  layout: TextBlockLayout;
  x: number;
  y: number;
  align: MantleText['align'];
};

export type MantleSceneLayout = {
  canvasRect: Rect;
  availableRect: Rect;
  imageBounds: Rect;
  baseImageRect: Rect;
  imageRect: Rect;
  text: MantleText;
  showText: boolean;
  textDraw?: MantleTextDraw | undefined;
  palette: MantlePalette;
  cornerRadius: number;
  contentPadding: number;
  drawScale: number;
  frameRotation: number;
};

export function resolveMantleSceneLayout({
  ctx,
  card,
  asset,
  width,
  height,
  scale
}: {
  ctx: MantleCanvasRenderingContext2D;
  card: MantleCard;
  asset?: MantleRenderableAsset | undefined;
  width: number;
  height: number;
  scale: number;
}): MantleSceneLayout {
  const palette = card.background.palette;
  const canvasRect: Rect = { x: 0, y: 0, width, height };
  const drawScale = width / NOMINAL_WIDTH;
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
  const edgeInset = showText ? Math.min(width, height) * 0.03 : 0;
  let imageBounds: Rect = { ...availableRect };
  let textDraw: MantleTextDraw | undefined;

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

      textDraw = { layout, x: textX, y: textY, align: text.align };
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

      textDraw = { layout, x: textX, y: textY, align: text.align };
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
  const baseImageRect = fitFrameRectToAsset({
    bounds: imageBounds,
    asset,
    card,
    cardWidth: width,
    contentPadding
  });
  const frameTransform = resolveFrameTransform(card.frameTransform);
  const imageRect = applyFrameTransformToRect({
    rect: baseImageRect,
    canvas: canvasRect,
    transform: frameTransform
  });

  return {
    canvasRect,
    availableRect,
    imageBounds,
    baseImageRect,
    imageRect,
    text,
    showText,
    textDraw,
    palette,
    cornerRadius,
    contentPadding,
    drawScale,
    frameRotation: frameTransform.rotation
  };
}
