import type { MantleCard, MantlePalette } from '@mantle/schemas/model';

import {
  createCanvas,
  getCanvas2D,
  releaseScratchCanvas,
  type MantleCanvasRenderingContext2D
} from '../canvas';
import {
  drawBottomRoundRectPath,
  drawRoundRectPath
} from '../frames/drawHelpers';
import {
  paintFrameBox,
  resolveFrameBoxStyle,
  resolveFrameChrome
} from '../frames';
import { assertRgbaScratchBudget } from '../memoryBudget';
import { isLightPalette, mixHex, parseHexToRgb, rgbToCss } from '../palette';
import {
  applyShadowLayer,
  clearShadow,
  getShadowLayers,
  resolveFrameShadowSettings,
  type ShadowLayer,
  type ShadowSettings
} from '../shadows';
import type { Rect } from '../types';
import type { LoadedMantleImage } from './imageCache';

function clampRectToCanvas(rect: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const right = Math.min(width, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(height, Math.ceil(rect.y + rect.height));

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y)
  };
}

function localRect(rect: Rect, origin: Rect): Rect {
  return {
    x: rect.x - origin.x,
    y: rect.y - origin.y,
    width: rect.width,
    height: rect.height
  };
}

function shadowScratchRect(
  layer: ShadowLayer,
  imageRect: Rect,
  canvasWidth: number,
  canvasHeight: number
): Rect {
  const spread = Math.ceil(layer.blur * 3 + Math.abs(layer.offsetY) + Math.abs(layer.offsetX) + 4);
  return clampRectToCanvas(
    {
      x: imageRect.x - spread,
      y: imageRect.y - spread,
      width: imageRect.width + spread * 2,
      height: imageRect.height + spread * 2
    },
    canvasWidth,
    canvasHeight
  );
}

function applyShadowVerticalMask(
  ctx: MantleCanvasRenderingContext2D,
  layer: ShadowLayer,
  imageRect: Rect
): void {
  if (!layer.mask) return;

  const fadeTop = imageRect.y - layer.blur - Math.abs(layer.offsetY);
  const fadeBottom = imageRect.y + imageRect.height + layer.blur + Math.abs(layer.offsetY);
  const gradient = ctx.createLinearGradient(0, fadeTop, 0, fadeBottom);

  gradient.addColorStop(0, `rgba(0, 0, 0, ${layer.mask.topAlpha})`);
  gradient.addColorStop(0.52, `rgba(0, 0, 0, ${layer.mask.midAlpha})`);
  gradient.addColorStop(1, `rgba(0, 0, 0, ${layer.mask.bottomAlpha})`);

  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function drawOuterFrameShadow(
  ctx: MantleCanvasRenderingContext2D,
  imageRect: Rect,
  cornerRadius: number,
  card: MantleCard,
  palette: MantlePalette,
  width: number
): void {
  const settings = resolveFrameShadowSettings(card.frame, palette);
  const frameBoxStyle = resolveFrameBoxStyle(card.frame);
  // Glass and frameless modes keep the same three-layer shadow language, with
  // softer strength so the frame material changes without changing scene depth.
  const adjustedSettings: ShadowSettings =
    frameBoxStyle === 'glass-panel'
      ? {
          ...settings,
          strength: settings.strength * 0.86,
          softness: Math.max(settings.softness, 1.05)
        }
      : frameBoxStyle === 'none'
        ? {
            ...settings,
            strength: settings.strength * 0.82
          }
        : settings;
  const layers = getShadowLayers(adjustedSettings, width);

  if (layers.length === 0) return;

  layers.forEach((layer) => {
    const scratchRect = shadowScratchRect(
      layer,
      imageRect,
      ctx.canvas.width,
      ctx.canvas.height
    );
    const clippedImageRect = localRect(imageRect, scratchRect);
    assertRgbaScratchBudget({
      label: 'Frame shadow layer',
      width: scratchRect.width,
      height: scratchRect.height,
      buffers: 1
    });

    const buffer = createCanvas(scratchRect.width, scratchRect.height);
    const bufferCtx = getCanvas2D(buffer);

    try {
      bufferCtx.clearRect(0, 0, buffer.width, buffer.height);
      bufferCtx.save();
      bufferCtx.translate(-scratchRect.x, -scratchRect.y);
      applyShadowLayer(bufferCtx, layer);
      drawRoundRectPath(bufferCtx, imageRect, cornerRadius);
      bufferCtx.fillStyle = '#000000';
      bufferCtx.fill();
      clearShadow(bufferCtx);

      bufferCtx.globalCompositeOperation = 'destination-out';
      drawRoundRectPath(bufferCtx, imageRect, cornerRadius);
      bufferCtx.fillStyle = '#000000';
      bufferCtx.fill();
      bufferCtx.restore();

      applyShadowVerticalMask(bufferCtx, layer, clippedImageRect);

      ctx.drawImage(buffer, scratchRect.x, scratchRect.y);
    } finally {
      releaseScratchCanvas(buffer);
    }
  });
}

function insetRect(rect: Rect, inset: number): Rect {
  const safeInset = Math.min(
    Math.max(0, inset),
    Math.max(0, rect.width / 2 - 1),
    Math.max(0, rect.height / 2 - 1)
  );

  return {
    x: rect.x + safeInset,
    y: rect.y + safeInset,
    width: Math.max(1, rect.width - safeInset * 2),
    height: Math.max(1, rect.height - safeInset * 2)
  };
}

function innerRadiusFor(cornerRadius: number, inset: number): number {
  return Math.max(0, cornerRadius - inset * 0.6);
}

function shouldInsetChrome(card: MantleCard): boolean {
  return (
    resolveFrameBoxStyle(card.frame) !== 'none' &&
    card.frame.preset !== 'none'
  );
}

function getChromeContentPadding(card: MantleCard, contentPadding: number): number {
  return (
    resolveFrameBoxStyle(card.frame) !== 'none' &&
    card.frame.preset === 'none'
  )
    ? contentPadding
    : 0;
}

function drawFrameBox(
  ctx: MantleCanvasRenderingContext2D,
  imageRect: Rect,
  cornerRadius: number,
  contentPadding: number,
  card: MantleCard,
  palette: MantlePalette,
  width: number
): void {
  paintFrameBox({
    ctx,
    imageRect,
    cornerRadius,
    contentPadding,
    palette,
    cardWidth: width,
    boxStyle: resolveFrameBoxStyle(card.frame),
    boxColor: card.frame.boxColor,
    boxOpacity: card.frame.boxOpacity,
    glassBlur: card.frame.glassBlur,
    glassOutlineOpacity: card.frame.glassOutlineOpacity
  });
}

function resolveChromeText(card: MantleCard): string {
  return card.frame.chromeText?.trim() || card.name;
}

function resolveContentStroke(
  card: MantleCard,
  palette: MantlePalette
): string | undefined {
  const boxStyle = resolveFrameBoxStyle(card.frame);
  if (boxStyle === 'glass-panel') {
    const outlineOpacity = card.frame.glassOutlineOpacity ?? 0.3;
    if (outlineOpacity <= 0) return undefined;
    return rgbToCss(
      parseHexToRgb(card.frame.boxColor ?? '#ffffff'),
      outlineOpacity * 0.62
    );
  }

  return isLightPalette(palette)
    ? 'rgba(15, 18, 21, 0.12)'
    : 'rgba(255, 255, 255, 0.16)';
}

export function drawImageWithShadowedFrame(
  ctx: MantleCanvasRenderingContext2D,
  image: LoadedMantleImage,
  imageRect: Rect,
  cornerRadius: number,
  contentPadding: number,
  card: MantleCard,
  palette: MantlePalette,
  width: number
): Rect {
  drawOuterFrameShadow(ctx, imageRect, cornerRadius, card, palette, width);
  drawFrameBox(ctx, imageRect, cornerRadius, contentPadding, card, palette, width);

  const insetChrome = shouldInsetChrome(card);
  const chromeRect = insetChrome ? insetRect(imageRect, contentPadding) : imageRect;
  const chromeCornerRadius = insetChrome
    ? innerRadiusFor(cornerRadius, contentPadding)
    : cornerRadius;
  const chromeContentPadding = getChromeContentPadding(card, contentPadding);

  const chrome = resolveFrameChrome(card.frame.preset)({
    ctx,
    imageRect: chromeRect,
    cornerRadius: chromeCornerRadius,
    contentPadding: chromeContentPadding,
    palette,
    cardWidth: width,
    title: resolveChromeText(card)
  });
  const drawContentPath = () => {
    if (chrome.contentCornerStyle === 'none') {
      ctx.beginPath();
      ctx.rect(
        chrome.contentRect.x,
        chrome.contentRect.y,
        chrome.contentRect.width,
        chrome.contentRect.height
      );
      return;
    }

    if (chrome.contentCornerStyle === 'bottom') {
      drawBottomRoundRectPath(ctx, chrome.contentRect, chrome.contentRadius);
      return;
    }

    drawRoundRectPath(ctx, chrome.contentRect, chrome.contentRadius);
  };

  ctx.save();
  drawContentPath();
  ctx.fillStyle = palette.background;
  ctx.fill();
  ctx.restore();

  ctx.save();
  drawContentPath();
  ctx.clip();

  const imageWidth = 'naturalWidth' in image ? image.naturalWidth : image.width;
  const imageHeight = 'naturalHeight' in image ? image.naturalHeight : image.height;
  const imageAspect = imageWidth / imageHeight;
  const rectAspect = chrome.contentRect.width / chrome.contentRect.height;
  let drawWidth = chrome.contentRect.width;
  let drawHeight = chrome.contentRect.height;

  if (imageAspect > rectAspect) {
    drawHeight = chrome.contentRect.width / imageAspect;
  } else {
    drawWidth = chrome.contentRect.height * imageAspect;
  }

  const drawX = chrome.contentRect.x + (chrome.contentRect.width - drawWidth) / 2;
  const drawY = chrome.contentRect.y + (chrome.contentRect.height - drawHeight) / 2;
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  ctx.restore();

  const contentStroke = resolveContentStroke(card, palette);
  if (contentStroke) {
    ctx.save();
    drawContentPath();
    ctx.lineWidth = Math.max(1, width / 1600);
    ctx.strokeStyle = contentStroke;
    ctx.stroke();
    ctx.restore();
  }

  return chrome.contentRect;
}

export function drawEmptyScreenshotPlaceholder(
  ctx: MantleCanvasRenderingContext2D,
  imageRect: Rect,
  cornerRadius: number,
  contentPadding: number,
  card: MantleCard,
  palette: MantlePalette,
  width: number,
  showPlaceholderText = true
): void {
  drawOuterFrameShadow(ctx, imageRect, cornerRadius, card, palette, width);
  drawFrameBox(ctx, imageRect, cornerRadius, contentPadding, card, palette, width);

  const insetChrome = shouldInsetChrome(card);
  const chromeRect = insetChrome ? insetRect(imageRect, contentPadding) : imageRect;
  const chromeCornerRadius = insetChrome
    ? innerRadiusFor(cornerRadius, contentPadding)
    : cornerRadius;
  const chromeContentPadding = getChromeContentPadding(card, contentPadding);

  const chrome = resolveFrameChrome(card.frame.preset)({
    ctx,
    imageRect: chromeRect,
    cornerRadius: chromeCornerRadius,
    contentPadding: chromeContentPadding,
    palette,
    cardWidth: width,
    title: resolveChromeText(card)
  });

  ctx.save();
  if (chrome.contentCornerStyle === 'bottom') {
    drawBottomRoundRectPath(ctx, chrome.contentRect, chrome.contentRadius);
  } else {
    drawRoundRectPath(ctx, chrome.contentRect, chrome.contentRadius);
  }
  const fill = isLightPalette(palette)
    ? mixHex(palette.background, palette.foreground, 0.05)
    : mixHex(palette.background, palette.foreground, 0.08);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1, width / 1600);
  ctx.setLineDash([width * 0.012, width * 0.012]);
  ctx.strokeStyle = rgbToCss(parseHexToRgb(palette.foreground), 0.28);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  if (showPlaceholderText) {
    ctx.save();
    ctx.fillStyle = rgbToCss(parseHexToRgb(palette.foreground), 0.45);
    ctx.font = `${Math.max(14, Math.round(chrome.contentRect.height * 0.05))}px ui-monospace, "SF Mono", Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      'DROP SCREENSHOT',
      chrome.contentRect.x + chrome.contentRect.width / 2,
      chrome.contentRect.y + chrome.contentRect.height / 2
    );
    ctx.restore();
  }
}
