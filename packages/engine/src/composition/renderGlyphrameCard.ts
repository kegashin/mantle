import {
  DEFAULT_GLYPHRAME_TEXT,
  DEFAULT_GLYPHRAME_PALETTE,
  type ExportResult,
  type GlyphrameAsset,
  type GlyphrameCard,
  type GlyphrameExportFormat,
  type GlyphramePalette,
  type GlyphrameText,
  type GlyphrameSurfaceTarget
} from '@glyphrame/schemas';

import { resolveBackgroundGenerator } from './backgrounds';
import {
  normalizeFrameChromePreset,
  paintFrameBox,
  resolveFrameBoxStyle,
  resolveFrameChrome
} from './frames';
import { isLightPalette, mixHex, parseHexToRgb, rgbToCss } from './palette';
import {
  applyShadowLayer,
  clearShadow,
  getShadowLayers,
  resolveFrameShadowSettings
} from './shadows';
import type { ShadowLayer } from './shadows';
import type { Rect } from './types';

const NOMINAL_WIDTH = 1600;
const IMAGE_CACHE = new Map<string, Promise<HTMLImageElement>>();
const EXPORT_MIME_TYPES: Record<GlyphrameExportFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif'
};
const EXPORT_EXTENSIONS: Record<GlyphrameExportFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  avif: 'avif'
};

export type GlyphrameRenderInput = {
  card: GlyphrameCard;
  target: GlyphrameSurfaceTarget;
  asset?: GlyphrameAsset | undefined;
  showEmptyPlaceholderText?: boolean | undefined;
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
  canvas?: HTMLCanvasElement | undefined;
};

function ensureCanvas(input: GlyphrameRenderInput, width: number, height: number): HTMLCanvasElement {
  if (input.canvas) {
    if (input.canvas.width !== width) input.canvas.width = width;
    if (input.canvas.height !== height) input.canvas.height = height;
    return input.canvas;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const cached = IMAGE_CACHE.get(dataUrl);
  if (cached) return cached;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => {
      IMAGE_CACHE.delete(dataUrl);
      reject(new Error('Could not decode image.'));
    });
    image.src = dataUrl;
  });
  IMAGE_CACHE.set(dataUrl, promise);
  return promise;
}

function drawRoundRectPath(
  ctx: CanvasRenderingContext2D,
  { x, y, width, height }: Rect,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawBottomRoundRectPath(
  ctx: CanvasRenderingContext2D,
  { x, y, width, height }: Rect,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y);
  ctx.closePath();
}

type TextBlockItem =
  | {
      type: 'line';
      text: string;
      font: string;
      color: string;
      lineHeight: number;
    }
  | {
      type: 'spacer';
      height: number;
    };

type TextBlockLayout = {
  items: TextBlockItem[];
  width: number;
  height: number;
};

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  const pushLongWord = (word: string) => {
    let chunk = '';
    for (const char of word) {
      const next = `${chunk}${char}`;
      if (chunk && ctx.measureText(next).width > maxWidth) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk = next;
      }
    }
    line = chunk;
  };

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (ctx.measureText(line).width > maxWidth) {
        pushLongWord(line);
      }
    } else if (!line && ctx.measureText(word).width > maxWidth) {
      pushLongWord(word);
    } else {
      line = next;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function resolveCardText(card: GlyphrameCard): GlyphrameText {
  return card.text ?? DEFAULT_GLYPHRAME_TEXT;
}

function hasVisibleText(text: GlyphrameText): boolean {
  return text.placement !== 'none' && Boolean(text.title?.trim() || text.subtitle?.trim());
}

function resolveTextFontStack(font: GlyphrameText['titleFont']): string {
  switch (font) {
    case 'system':
      return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    case 'display':
      return '"Avenir Next", Avenir, "Helvetica Neue", Arial, sans-serif';
    case 'rounded':
      return 'ui-rounded, "SF Pro Rounded", "Avenir Next Rounded Std", "Nunito", system-ui, sans-serif';
    case 'serif':
      return 'ui-serif, Georgia, "Times New Roman", serif';
    case 'editorial':
      return '"New York", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
    case 'slab':
      return 'Rockwell, "Roboto Slab", "Courier New", ui-serif, serif';
    case 'mono':
      return 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    case 'code':
      return '"JetBrains Mono", "SF Mono", "Cascadia Code", "Fira Code", ui-monospace, monospace';
    case 'condensed':
      return '"Arial Narrow", "Helvetica Neue Condensed", "Roboto Condensed", Arial, sans-serif';
    case 'sans':
    default:
      return '"Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  }
}

function createTextBlockLayout({
  ctx,
  text,
  palette,
  maxWidth,
  reference
}: {
  ctx: CanvasRenderingContext2D;
  text: GlyphrameText;
  palette: GlyphramePalette;
  maxWidth: number;
  reference: number;
}): TextBlockLayout {
  const items: TextBlockItem[] = [];
  const title = text.title?.trim();
  const subtitle = text.subtitle?.trim();
  const titleSize = Math.max(24, Math.round(reference * 0.038 * text.scale));
  const subtitleSize = Math.max(15, Math.round(reference * 0.018 * text.scale));
  const titleFontStack = resolveTextFontStack(text.titleFont);
  const subtitleFontStack = resolveTextFontStack(text.subtitleFont);
  const titleFont = `700 ${titleSize}px ${titleFontStack}`;
  const subtitleFont = `500 ${subtitleSize}px ${subtitleFontStack}`;
  const titleColor = text.titleColor ?? palette.foreground;
  const mutedColor = palette.muted ?? mixHex(palette.foreground, palette.background, 0.4);
  const subtitleColor = text.subtitleColor ?? mutedColor;

  if (title) {
    ctx.save();
    ctx.font = titleFont;
    wrapTextLines(ctx, title, maxWidth).forEach((line) => {
      items.push({
        type: 'line',
        text: line,
        font: titleFont,
        color: titleColor,
        lineHeight: titleSize * 1.08
      });
    });
    ctx.restore();
  }

  if (title && subtitle) {
    items.push({ type: 'spacer', height: Math.max(8, subtitleSize * 0.72) });
  }

  if (subtitle) {
    ctx.save();
    ctx.font = subtitleFont;
    wrapTextLines(ctx, subtitle, maxWidth).forEach((line) => {
      items.push({
        type: 'line',
        text: line,
        font: subtitleFont,
        color: subtitleColor,
        lineHeight: subtitleSize * 1.32
      });
    });
    ctx.restore();
  }

  return {
    items,
    width: maxWidth,
    height: items.reduce(
      (sum, item) => sum + (item.type === 'line' ? item.lineHeight : item.height),
      0
    )
  };
}

function drawTextBlock({
  ctx,
  layout,
  x,
  y,
  align
}: {
  ctx: CanvasRenderingContext2D;
  layout: TextBlockLayout;
  x: number;
  y: number;
  align: CanvasTextAlign;
}): void {
  const anchorX =
    align === 'center' ? x + layout.width / 2 : align === 'right' ? x + layout.width : x;
  let cursorY = y;

  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = 'top';

  layout.items.forEach((item) => {
    if (item.type === 'spacer') {
      cursorY += item.height;
      return;
    }

    ctx.fillStyle = item.color;
    ctx.font = item.font;
    ctx.fillText(item.text, anchorX, cursorY);
    cursorY += item.lineHeight;
  });

  ctx.restore();
}

function safeFileName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'glyphrame-card'
  );
}

function resolvePalette(card: GlyphrameCard): GlyphramePalette {
  return card.background.palette ?? DEFAULT_GLYPHRAME_PALETTE;
}

function rasterizeCanvas(
  canvas: HTMLCanvasElement,
  format: GlyphrameExportFormat,
  quality?: number
): Promise<Blob> {
  const mimeType = EXPORT_MIME_TYPES[format];
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

function drawOuterFrameShadow(
  ctx: CanvasRenderingContext2D,
  imageRect: Rect,
  cornerRadius: number,
  card: GlyphrameCard,
  palette: GlyphramePalette,
  width: number
): void {
  const settings = resolveFrameShadowSettings(card.frame, palette);
  const layers = getShadowLayers(settings, width);
  if (layers.length === 0) return;

  const buffer = document.createElement('canvas');
  buffer.width = ctx.canvas.width;
  buffer.height = ctx.canvas.height;
  const bufferCtx = buffer.getContext('2d');
  if (!bufferCtx) return;

  layers.forEach((layer) => {
    bufferCtx.clearRect(0, 0, buffer.width, buffer.height);
    bufferCtx.save();
    applyShadowLayer(bufferCtx, layer);
    drawRoundRectPath(bufferCtx, imageRect, cornerRadius);
    bufferCtx.fillStyle = '#000000';
    bufferCtx.fill();
    clearShadow(bufferCtx);

    bufferCtx.globalCompositeOperation = 'destination-out';
    drawRoundRectPath(bufferCtx, imageRect, cornerRadius);
    bufferCtx.fillStyle = '#000000';
    bufferCtx.fill();

    applyShadowVerticalMask(bufferCtx, layer, imageRect);
    bufferCtx.restore();

    ctx.drawImage(buffer, 0, 0);
  });
}

function applyShadowVerticalMask(
  ctx: CanvasRenderingContext2D,
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

function shouldInsetChrome(card: GlyphrameCard): boolean {
  return (
    resolveFrameBoxStyle(card.frame) !== 'none' &&
    normalizeFrameChromePreset(card.frame.preset) !== 'none'
  );
}

function getChromeContentPadding(card: GlyphrameCard, contentPadding: number): number {
  return (
    resolveFrameBoxStyle(card.frame) !== 'none' &&
    normalizeFrameChromePreset(card.frame.preset) === 'none'
  )
    ? contentPadding
    : 0;
}

function drawFrameBox(
  ctx: CanvasRenderingContext2D,
  imageRect: Rect,
  cornerRadius: number,
  contentPadding: number,
  card: GlyphrameCard,
  palette: GlyphramePalette,
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
    boxBorderColor: card.frame.boxBorderColor,
    boxOpacity: card.frame.boxOpacity
  });
}

function resolveChromeText(card: GlyphrameCard): string {
  return card.frame.chromeText?.trim() || card.name;
}

function drawImageWithShadowedFrame(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  imageRect: Rect,
  cornerRadius: number,
  contentPadding: number,
  card: GlyphrameCard,
  palette: GlyphramePalette,
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

  // Fill the content area without another shadow; the shadow belongs to the
  // outer frame, otherwise high radii reveal a second body silhouette.
  ctx.save();
  drawContentPath();
  ctx.fillStyle = palette.background;
  ctx.fill();
  ctx.restore();

  // Screenshot, contain-fitted and clipped. The outer frame is already
  // sized to the screenshot aspect ratio, so this only absorbs rounding
  // and frame-chrome differences without cropping the source.
  ctx.save();
  drawContentPath();
  ctx.clip();

  const imageAspect = image.naturalWidth / image.naturalHeight;
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

  // Subtle border over the clipped image to reinforce the frame edge.
  ctx.save();
  drawContentPath();
  ctx.lineWidth = Math.max(1, width / 1600);
  ctx.strokeStyle = isLightPalette(palette)
    ? 'rgba(15, 18, 21, 0.12)'
    : 'rgba(255, 255, 255, 0.16)';
  ctx.stroke();
  ctx.restore();

  return chrome.contentRect;
}

function getFrameChromeReservedSpace(
  framePreset: GlyphrameCard['frame']['preset'],
  boxStyle: ReturnType<typeof resolveFrameBoxStyle>,
  cardWidth: number,
  contentPadding: number
): { x: number; y: number } {
  const chromePreset = normalizeFrameChromePreset(framePreset);
  const hasBox = boxStyle !== 'none';
  const hasChrome = chromePreset !== 'none';
  const outerInset = hasBox && hasChrome ? contentPadding * 2 : 0;
  const innerPadding = hasBox && !hasChrome ? contentPadding * 2 : 0;

  if (
    chromePreset === 'macos-window' ||
    chromePreset === 'minimal-browser' ||
    chromePreset === 'terminal-window' ||
    chromePreset === 'windows-window'
  ) {
    const minimum =
      chromePreset === 'minimal-browser' ? 44 : chromePreset === 'macos-window' ? 36 : 32;
    const headerHeight = Math.max(minimum, Math.round(cardWidth * 0.028));
    return {
      x: outerInset + innerPadding,
      y: outerInset + headerHeight + innerPadding
    };
  }

  if (hasBox) {
    return { x: contentPadding * 2, y: contentPadding * 2 };
  }

  return { x: 0, y: 0 };
}

function fitFrameRectToAsset({
  bounds,
  asset,
  card,
  cardWidth,
  contentPadding
}: {
  bounds: Rect;
  asset?: GlyphrameAsset | undefined;
  card: GlyphrameCard;
  cardWidth: number;
  contentPadding: number;
}): Rect {
  const assetWidth = asset?.width ?? 16;
  const assetHeight = asset?.height ?? 9;
  const aspect = Math.max(0.05, assetWidth / assetHeight);
  const reserved = getFrameChromeReservedSpace(
    card.frame.preset,
    resolveFrameBoxStyle(card.frame),
    cardWidth,
    contentPadding
  );
  const contentMaxWidth = Math.max(1, bounds.width - reserved.x);
  const contentMaxHeight = Math.max(1, bounds.height - reserved.y);

  let contentWidth = contentMaxWidth;
  let contentHeight = contentWidth / aspect;
  if (contentHeight > contentMaxHeight) {
    contentHeight = contentMaxHeight;
    contentWidth = contentHeight * aspect;
  }

  const frameWidth = contentWidth + reserved.x;
  const frameHeight = contentHeight + reserved.y;

  return {
    x: bounds.x + (bounds.width - frameWidth) / 2,
    y: bounds.y + (bounds.height - frameHeight) / 2,
    width: frameWidth,
    height: frameHeight
  };
}

function drawEmptyScreenshotPlaceholder(
  ctx: CanvasRenderingContext2D,
  imageRect: Rect,
  cornerRadius: number,
  contentPadding: number,
  card: GlyphrameCard,
  palette: GlyphramePalette,
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

export async function renderGlyphrameCardToCanvas(
  input: GlyphrameRenderInput
): Promise<HTMLCanvasElement> {
  const scale = Math.max(0.1, input.scale ?? 1);
  const width = Math.round(input.target.width * scale);
  const height = Math.round(input.target.height * scale);
  const canvas = ensureCanvas(input, width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable.');

  ctx.save();
  ctx.clearRect(0, 0, width, height);

  const card = input.card;
  const palette = resolvePalette(card);
  const canvasRect: Rect = { x: 0, y: 0, width, height };
  const drawScale = width / NOMINAL_WIDTH;

  // 1. Background — flat fill first (covers everything below gradient/glyph).
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);

  // 2. Background art (family-aware).
  const generator = resolveBackgroundGenerator(card.background.presetId);
  generator({
    ctx,
    rect: canvasRect,
    palette,
    intensity: card.background.intensity,
    params: card.background.params ?? {},
    seed: card.background.seed,
    scale: drawScale
  });

  // 3. Text block — placed in one exact edge band before the screenshot is fit.
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
      const textWidth = Math.min(availableRect.width, Math.max(1, availableRect.width * text.width));
      const layout = createTextBlockLayout({
        ctx,
        text,
        palette,
        maxWidth: textWidth,
        reference: textReference
      });
      const textX =
        text.align === 'center'
          ? availableRect.x + (availableRect.width - layout.width) / 2
          : text.align === 'right'
            ? availableRect.x + availableRect.width - layout.width
            : availableRect.x;
      const textY =
        text.placement === 'top'
          ? availableRect.y
          : availableRect.y + availableRect.height - layout.height;

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
        reference: textReference
      });
      const textX =
        text.placement === 'left'
          ? availableRect.x
          : availableRect.x + availableRect.width - layout.width;
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

  // 4. Screenshot area — rectangle left over after text + padding.
  const cornerRadius = card.frame.cornerRadius * scale;
  const contentPadding = (card.frame.contentPadding ?? 0) * scale;
  const imageRect = fitFrameRectToAsset({
    bounds: imageBounds,
    asset: input.asset,
    card,
    cardWidth: width,
    contentPadding
  });

  if (input.asset?.dataUrl) {
    const image = await loadImage(input.asset.dataUrl);
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

  ctx.restore();
  return canvas;
}

export async function exportGlyphrameCard(
  input: GlyphrameRenderInput
): Promise<ExportResult> {
  const format = input.card.export.format;
  const canvas = await renderGlyphrameCardToCanvas({
    ...input,
    scale: input.scale ?? input.card.export.scale
  });
  const blob = await rasterizeCanvas(canvas, format, input.card.export.quality);
  const mimeType = EXPORT_MIME_TYPES[format];

  return {
    blob,
    filename: `${safeFileName(input.card.name)}.${EXPORT_EXTENSIONS[format]}`,
    mimeType
  };
}
