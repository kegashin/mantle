import type {
  MantleFrameBoxStyle,
  MantleFramePreset
} from '@mantle/schemas/model';

import { isLightPalette, mixHex, parseHexToRgb, rgbToCss } from '../palette';
import {
  createCanvas,
  getCanvas2D,
  releaseScratchCanvas,
  type MantleCanvasRenderingContext2D
} from '../canvas';
import { assertRgbaScratchBudget } from '../memoryBudget';
import { drawRoundRectPath } from './drawHelpers';
import type {
  FrameBoxInput,
  FrameChrome,
  FrameChromePreset,
  FrameChromeResult,
  FrameRegistry
} from './types';
import type { Rect } from '../types';

export type {
  FrameBoxInput,
  FrameChromeInput,
  FrameChromePreset,
  FrameChromeResult,
  FrameChrome
} from './types';

const TRAFFIC_LIGHT_COLORS = ['#ff5f57', '#febc2e', '#28c840'] as const;

function headerHeightFor(cardWidth: number, minimum = 34): number {
  return Math.max(minimum, Math.round(cardWidth * 0.028));
}

function noneChrome({
  imageRect,
  cornerRadius,
  contentPadding
}: Parameters<FrameChrome>[0]): FrameChromeResult {
  return {
    contentRect: insetRect(imageRect, contentPadding),
    contentRadius: contentRadiusFor(cornerRadius, contentPadding)
  };
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

function contentRadiusFor(cornerRadius: number, contentPadding: number): number {
  return Math.max(0, cornerRadius - contentPadding * 0.6);
}

function windowContentRadiusFor(
  cornerRadius: number,
  contentPadding: number,
  headerHeight: number
): number {
  const radius = contentRadiusFor(cornerRadius, contentPadding);
  if (contentPadding <= 0) return radius;
  return Math.min(radius, Math.max(6, Math.min(headerHeight * 0.42, contentPadding * 0.72)));
}

function colorWithAlpha(hex: string, alpha: number): string {
  return rgbToCss(parseHexToRgb(hex), alpha);
}

function clampGlassAlpha(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function clampGlassBlurPx(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return 5;
  return Math.min(5, Math.max(0, value));
}

function clampIndex(value: number, max: number): number {
  return Math.min(max, Math.max(0, value));
}

function boxBlurHorizontal(
  source: Uint8ClampedArray,
  target: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): void {
  const divisor = radius * 2 + 1;
  const maxX = width - 1;

  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 0;

    for (let x = -radius; x <= radius; x += 1) {
      const offset = row + clampIndex(x, maxX) * 4;
      red += source[offset]!;
      green += source[offset + 1]!;
      blue += source[offset + 2]!;
      alpha += source[offset + 3]!;
    }

    for (let x = 0; x < width; x += 1) {
      const offset = row + x * 4;
      target[offset] = red / divisor;
      target[offset + 1] = green / divisor;
      target[offset + 2] = blue / divisor;
      target[offset + 3] = alpha / divisor;

      const removeOffset = row + clampIndex(x - radius, maxX) * 4;
      const addOffset = row + clampIndex(x + radius + 1, maxX) * 4;
      red += source[addOffset]! - source[removeOffset]!;
      green += source[addOffset + 1]! - source[removeOffset + 1]!;
      blue += source[addOffset + 2]! - source[removeOffset + 2]!;
      alpha += source[addOffset + 3]! - source[removeOffset + 3]!;
    }
  }
}

function boxBlurVertical(
  source: Uint8ClampedArray,
  target: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): void {
  const divisor = radius * 2 + 1;
  const maxY = height - 1;

  for (let x = 0; x < width; x += 1) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 0;

    for (let y = -radius; y <= radius; y += 1) {
      const offset = (clampIndex(y, maxY) * width + x) * 4;
      red += source[offset]!;
      green += source[offset + 1]!;
      blue += source[offset + 2]!;
      alpha += source[offset + 3]!;
    }

    for (let y = 0; y < height; y += 1) {
      const offset = (y * width + x) * 4;
      target[offset] = red / divisor;
      target[offset + 1] = green / divisor;
      target[offset + 2] = blue / divisor;
      target[offset + 3] = alpha / divisor;

      const removeOffset = (clampIndex(y - radius, maxY) * width + x) * 4;
      const addOffset = (clampIndex(y + radius + 1, maxY) * width + x) * 4;
      red += source[addOffset]! - source[removeOffset]!;
      green += source[addOffset + 1]! - source[removeOffset + 1]!;
      blue += source[addOffset + 2]! - source[removeOffset + 2]!;
      alpha += source[addOffset + 3]! - source[removeOffset + 3]!;
    }
  }
}

function applyBackdropBlur(
  ctx: MantleCanvasRenderingContext2D,
  width: number,
  height: number,
  radius: number
): void {
  if (radius < 1 || width < 2 || height < 2) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const workB = new Uint8ClampedArray(imageData.data.length);
  const workC = new Uint8ClampedArray(imageData.data.length);
  let source = imageData.data;
  let target = workC;
  const passes = 2;

  for (let pass = 0; pass < passes; pass += 1) {
    boxBlurHorizontal(source, workB, width, height, radius);
    boxBlurVertical(workB, target, width, height, radius);
    const previousSource = source;
    source = target;
    target = previousSource;
  }

  imageData.data.set(source);
  ctx.putImageData(imageData, 0, 0);
}

function drawFrostedBackdrop(
  ctx: MantleCanvasRenderingContext2D,
  rect: Rect,
  cornerRadius: number,
  blur: number
): void {
  const effectiveBlur = blur <= 0 ? 0 : Math.max(0.75, blur * 1.35);
  const blurRadius = Math.min(64, Math.round(effectiveBlur));
  const margin = Math.ceil(Math.max(effectiveBlur, blurRadius) * 3);
  const sampleX = Math.max(0, Math.floor(rect.x - margin));
  const sampleY = Math.max(0, Math.floor(rect.y - margin));
  const sampleRight = Math.min(ctx.canvas.width, Math.ceil(rect.x + rect.width + margin));
  const sampleBottom = Math.min(ctx.canvas.height, Math.ceil(rect.y + rect.height + margin));
  const sampleWidth = Math.max(1, sampleRight - sampleX);
  const sampleHeight = Math.max(1, sampleBottom - sampleY);
  assertRgbaScratchBudget({
    label: 'Glass backdrop blur',
    width: sampleWidth,
    height: sampleHeight,
    buffers: 4
  });
  const buffer = createCanvas(sampleWidth, sampleHeight);
  const bufferCtx = getCanvas2D(buffer);

  try {
    bufferCtx.drawImage(
      ctx.canvas,
      sampleX,
      sampleY,
      sampleWidth,
      sampleHeight,
      0,
      0,
      sampleWidth,
      sampleHeight
    );

    applyBackdropBlur(bufferCtx, sampleWidth, sampleHeight, blurRadius);

    ctx.save();
    try {
      drawRoundRectPath(ctx, rect, cornerRadius);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(buffer, sampleX, sampleY, sampleWidth, sampleHeight);
    } finally {
      ctx.restore();
    }
  } finally {
    releaseScratchCanvas(buffer);
  }
}

function drawAcrylicMaterial({
  ctx,
  imageRect,
  cornerRadius,
  cardWidth,
  boxColor,
  boxOpacity,
  glassBlur,
  glassOutlineOpacity
}: Omit<FrameBoxInput, 'boxStyle' | 'contentPadding' | 'palette'>): void {
  const tintColor = boxColor ?? '#ffffff';
  const transparency = clampGlassAlpha(boxOpacity, 0.2);
  const outlineAlpha = clampGlassAlpha(glassOutlineOpacity, 0.3);
  const blur = clampGlassBlurPx(glassBlur) * (cardWidth / 1600);
  drawFrostedBackdrop(ctx, imageRect, cornerRadius, blur);

  ctx.save();
  drawRoundRectPath(ctx, imageRect, cornerRadius);
  ctx.fillStyle = colorWithAlpha(tintColor, transparency);
  ctx.fill();

  if (outlineAlpha > 0) {
    ctx.lineWidth = Math.max(1, cardWidth / 1600);
    ctx.strokeStyle = colorWithAlpha(tintColor, outlineAlpha);
    ctx.stroke();
  }

  ctx.restore();
}

function glassPanel({
  ctx,
  imageRect,
  cornerRadius,
  cardWidth,
  boxColor,
  boxOpacity,
  glassBlur,
  glassOutlineOpacity
}: FrameBoxInput): void {
  drawAcrylicMaterial({
    ctx,
    imageRect,
    cornerRadius,
    cardWidth,
    boxColor,
    boxOpacity,
    glassBlur,
    glassOutlineOpacity
  });
}

function solidPanel({
  ctx,
  imageRect,
  cornerRadius,
  palette,
  boxColor
}: FrameBoxInput): void {
  ctx.save();
  drawRoundRectPath(ctx, imageRect, cornerRadius);
  ctx.fillStyle = boxColor ?? palette.background;
  ctx.fill();
  ctx.restore();
}

function nonePanel(): void {
  // The shadow pass already establishes depth; this material adds no visible body.
}

function drawTrafficLights(
  ctx: MantleCanvasRenderingContext2D,
  rect: Rect,
  scale: number,
  cornerRadius: number
): number {
  const diameter = Math.max(8, rect.height * 0.38);
  const spacing = diameter * 1.55;
  const cy = rect.y + rect.height / 2;
  const topGap = Math.max(0, cy - diameter / 2 - rect.y);
  const minCenterInset = diameter / 2 + topGap;
  const baseInset = Math.max(diameter * 1.08, minCenterInset);
  const radiusInset = Math.min(cornerRadius * 0.34, rect.height * 0.72);
  const maxCx = rect.x + Math.max(baseInset, rect.width - diameter * 5);
  const cx = Math.min(rect.x + baseInset + radiusInset, maxCx);

  TRAFFIC_LIGHT_COLORS.forEach((color, index) => {
    const x = cx + index * spacing;
    const radius = diameter / 2;

    ctx.beginPath();
    ctx.arc(x, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = mixHex(color, '#000000', 0.28);
    ctx.lineWidth = Math.max(0.5, scale * 0.55);
    ctx.stroke();
  });

  return cx + (TRAFFIC_LIGHT_COLORS.length - 1) * spacing + diameter / 2;
}

function drawNavChevrons(
  ctx: MantleCanvasRenderingContext2D,
  startX: number,
  centerY: number,
  size: number,
  color: string,
  scale: number
): number {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, scale * 1.05);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(startX + size * 0.55, centerY - size * 0.45);
  ctx.lineTo(startX, centerY);
  ctx.lineTo(startX + size * 0.55, centerY + size * 0.45);
  ctx.stroke();

  const forwardX = startX + size * 1.55;
  ctx.beginPath();
  ctx.moveTo(forwardX, centerY - size * 0.45);
  ctx.lineTo(forwardX + size * 0.55, centerY);
  ctx.lineTo(forwardX, centerY + size * 0.45);
  ctx.stroke();
  ctx.restore();

  return forwardX + size * 0.55;
}

function drawLockIcon(
  ctx: MantleCanvasRenderingContext2D,
  x: number,
  centerY: number,
  size: number,
  color: string,
  scale: number
): void {
  const bodyWidth = size;
  const bodyHeight = size * 0.7;
  const bodyTop = centerY - bodyHeight * 0.18;
  const bodyLeft = x;
  const shackleRadius = bodyWidth * 0.32;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.85, scale * 0.85);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(
    bodyLeft + bodyWidth / 2,
    bodyTop,
    shackleRadius,
    Math.PI,
    0,
    false
  );
  ctx.stroke();

  drawRoundRectPath(
    ctx,
    {
      x: bodyLeft,
      y: bodyTop,
      width: bodyWidth,
      height: bodyHeight
    },
    bodyHeight * 0.18
  );
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawHeaderBand(
  ctx: MantleCanvasRenderingContext2D,
  imageRect: Rect,
  headerRect: Rect,
  cornerRadius: number,
  fill: string,
  border: string,
  lineWidth: number
): void {
  ctx.save();
  drawRoundRectPath(ctx, imageRect, cornerRadius);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(headerRect.x, headerRect.y, headerRect.width, headerRect.height);
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = border;
  ctx.beginPath();
  ctx.moveTo(headerRect.x, headerRect.y + headerRect.height);
  ctx.lineTo(headerRect.x + headerRect.width, headerRect.y + headerRect.height);
  ctx.stroke();
  ctx.restore();
}

function drawWindowOuterBorder(
  ctx: MantleCanvasRenderingContext2D,
  imageRect: Rect,
  cornerRadius: number,
  border: string,
  lineWidth: number
): void {
  ctx.save();
  drawRoundRectPath(ctx, imageRect, cornerRadius);
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = border;
  ctx.stroke();
  ctx.restore();
}

function macOsWindow({ ctx, imageRect, cornerRadius, contentPadding, palette, cardWidth, title }: Parameters<FrameChrome>[0]): FrameChromeResult {
  const scale = cardWidth / 1600;
  const headerHeight = headerHeightFor(cardWidth, 36);
  const headerRect: Rect = {
    x: imageRect.x,
    y: imageRect.y,
    width: imageRect.width,
    height: headerHeight
  };

  const light = isLightPalette(palette);
  // Flat title-bar fill keeps chrome quiet beside expressive backgrounds.
  const headerFill = light ? '#ebe8e0' : '#1d1f22';
  const headerBorder = light ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.08)';
  const titleColor = light ? 'rgba(15, 18, 21, 0.72)' : 'rgba(236, 236, 236, 0.78)';

  drawHeaderBand(
    ctx,
    imageRect,
    headerRect,
    cornerRadius,
    headerFill,
    headerBorder,
    Math.max(1, scale * 1.2)
  );
  drawWindowOuterBorder(ctx, imageRect, cornerRadius, headerBorder, Math.max(1.25, scale * 1.55));
  drawTrafficLights(ctx, headerRect, scale, cornerRadius);

  if (title) {
    ctx.save();
    ctx.fillStyle = titleColor;
    ctx.font = `${Math.max(12, Math.round(headerHeight * 0.42))}px ui-sans-serif, -apple-system, "SF Pro", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      title.length > 60 ? `${title.slice(0, 57)}…` : title,
      headerRect.x + headerRect.width / 2,
      headerRect.y + headerRect.height / 2
    );
    ctx.restore();
  }

  const bodyRect = {
    x: imageRect.x,
    y: imageRect.y + headerHeight,
    width: imageRect.width,
    height: imageRect.height - headerHeight
  };
  return {
    contentRect: insetRect(bodyRect, contentPadding),
    contentRadius: windowContentRadiusFor(cornerRadius, contentPadding, headerHeight),
    contentCornerStyle: contentPadding > 0 ? 'all' : 'bottom'
  };
}

function minimalBrowser({ ctx, imageRect, cornerRadius, contentPadding, palette, cardWidth, title }: Parameters<FrameChrome>[0]): FrameChromeResult {
  const scale = cardWidth / 1600;
  const headerHeight = headerHeightFor(cardWidth, 44);
  const headerRect: Rect = {
    x: imageRect.x,
    y: imageRect.y,
    width: imageRect.width,
    height: headerHeight
  };

  const light = isLightPalette(palette);
  // Flat toolbar fill keeps browser chrome understated.
  const headerFill = light ? '#f5f5f6' : '#1c1d20';
  const headerBorder = light ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.07)';
  const navColor = light ? 'rgba(20, 24, 28, 0.62)' : 'rgba(232, 232, 232, 0.7)';

  drawHeaderBand(
    ctx,
    imageRect,
    headerRect,
    cornerRadius,
    headerFill,
    headerBorder,
    Math.max(1, scale * 1.1)
  );
  drawWindowOuterBorder(ctx, imageRect, cornerRadius, headerBorder, Math.max(1.25, scale * 1.45));
  const controlsRight = drawTrafficLights(ctx, headerRect, scale, cornerRadius);

  // Browser controls are ordered as traffic lights, navigation, then URL pill.
  const chevronSize = headerHeight * 0.28;
  const chevronStartX = controlsRight + headerHeight * 0.5;
  const chevronCenterY = headerRect.y + headerHeight / 2;
  const chevronsRight = drawNavChevrons(
    ctx,
    chevronStartX,
    chevronCenterY,
    chevronSize,
    navColor,
    scale
  );

  const pillLeft = chevronsRight + headerHeight * 0.45;
  const pillRight = headerRect.x + headerRect.width - headerRect.height * 1.2;
  const pillY = headerRect.y + headerHeight * 0.22;
  const pillHeight = headerHeight * 0.56;
  const pillWidth = Math.max(0, pillRight - pillLeft);

  if (pillWidth >= 32) {
    ctx.save();
    drawRoundRectPath(
      ctx,
      { x: pillLeft, y: pillY, width: pillWidth, height: pillHeight },
      pillHeight / 2
    );
    ctx.fillStyle = light ? 'rgba(255, 255, 255, 0.92)' : 'rgba(255, 255, 255, 0.06)';
    ctx.fill();
    ctx.strokeStyle = light ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = Math.max(0.75, scale * 0.8);
    ctx.stroke();
    ctx.restore();
  }

  // The lock icon makes the rounded pill read as an address bar.
  const lockSize = pillHeight * 0.46;
  const lockColor = light ? 'rgba(36, 132, 76, 0.78)' : 'rgba(140, 218, 168, 0.85)';
  const lockX = pillLeft + pillHeight * 0.42;
  if (pillWidth >= 56) {
    drawLockIcon(ctx, lockX, headerRect.y + headerHeight / 2, lockSize, lockColor, scale);
  }

  if (title && pillWidth >= 80) {
    ctx.save();
    ctx.fillStyle = light ? 'rgba(20, 24, 28, 0.74)' : 'rgba(230, 230, 230, 0.74)';
    ctx.font = `${Math.max(11, Math.round(pillHeight * 0.6))}px ui-monospace, "SF Mono", Menlo, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const textStart = lockX + lockSize * 1.4;
    const remaining = (pillRight - textStart) - pillHeight * 0.4;
    const maxChars = Math.max(4, Math.floor(remaining / (pillHeight * 0.4)));
    const text = title.length > maxChars ? `${title.slice(0, maxChars - 1)}…` : title;
    ctx.fillText(text, textStart, headerRect.y + headerHeight / 2);
    ctx.restore();
  }

  if (headerRect.width > headerHeight * 6) {
    ctx.save();
    ctx.fillStyle = navColor;
    const dotRadius = Math.max(1, scale * 1.2);
    const dotSpacing = dotRadius * 3.4;
    const dotsX = headerRect.x + headerRect.width - headerRect.height * 0.55;
    for (let i = -1; i <= 1; i += 1) {
      ctx.beginPath();
      ctx.arc(dotsX, chevronCenterY + i * dotSpacing, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  const bodyRect = {
    x: imageRect.x,
    y: imageRect.y + headerHeight,
    width: imageRect.width,
    height: imageRect.height - headerHeight
  };
  return {
    contentRect: insetRect(bodyRect, contentPadding),
    contentRadius: windowContentRadiusFor(cornerRadius, contentPadding, headerHeight),
    contentCornerStyle: contentPadding > 0 ? 'all' : 'bottom'
  };
}

function terminalWindow({ ctx, imageRect, cornerRadius, contentPadding, cardWidth, title }: Parameters<FrameChrome>[0]): FrameChromeResult {
  const scale = cardWidth / 1600;
  const headerHeight = headerHeightFor(cardWidth, 32);
  const headerRect: Rect = {
    x: imageRect.x,
    y: imageRect.y,
    width: imageRect.width,
    height: headerHeight
  };

  const headerFill = '#0c0d10';
  const headerBorder = 'rgba(255, 255, 255, 0.08)';
  drawHeaderBand(ctx, imageRect, headerRect, cornerRadius, headerFill, headerBorder, Math.max(1, scale * 1.1));
  drawWindowOuterBorder(ctx, imageRect, cornerRadius, headerBorder, Math.max(1.25, scale * 1.45));
  drawTrafficLights(ctx, headerRect, scale, cornerRadius);

  ctx.save();
  ctx.fillStyle = 'rgba(216, 216, 220, 0.7)';
  ctx.font = `${Math.max(11, Math.round(headerHeight * 0.48))}px ui-monospace, "SF Mono", Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = title ? `zsh — ${title}` : 'zsh — mantle';
  ctx.fillText(
    label.length > 80 ? `${label.slice(0, 77)}…` : label,
    headerRect.x + headerRect.width / 2,
    headerRect.y + headerRect.height / 2
  );
  ctx.restore();

  const bodyRect = {
    x: imageRect.x,
    y: imageRect.y + headerHeight,
    width: imageRect.width,
    height: imageRect.height - headerHeight
  };
  return {
    contentRect: insetRect(bodyRect, contentPadding),
    contentRadius: windowContentRadiusFor(cornerRadius, contentPadding, headerHeight),
    contentCornerStyle: contentPadding > 0 ? 'all' : 'bottom'
  };
}

function windowsWindow({ ctx, imageRect, cornerRadius, contentPadding, palette, cardWidth, title }: Parameters<FrameChrome>[0]): FrameChromeResult {
  const scale = cardWidth / 1600;
  const headerHeight = headerHeightFor(cardWidth, 32);
  const headerRect: Rect = {
    x: imageRect.x,
    y: imageRect.y,
    width: imageRect.width,
    height: headerHeight
  };

  const light = isLightPalette(palette);
  const headerFill = light ? '#f5f5f6' : '#1b1c1f';
  const headerBorder = light ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.06)';

  drawHeaderBand(ctx, imageRect, headerRect, cornerRadius, headerFill, headerBorder, Math.max(1, scale));
  drawWindowOuterBorder(ctx, imageRect, cornerRadius, headerBorder, Math.max(1.2, scale * 1.35));

  const iconGap = Math.max(12, headerHeight * 0.9);
  const iconSize = Math.max(7, headerHeight * 0.22);
  const baseY = headerRect.y + headerRect.height / 2;
  const rightInset = headerHeight * 0.9 + Math.min(cornerRadius * 0.22, headerHeight * 0.56);
  const rightEdge = headerRect.x + headerRect.width - rightInset;

  ctx.save();
  ctx.lineWidth = Math.max(1, scale);
  ctx.strokeStyle = light ? 'rgba(20, 24, 28, 0.64)' : 'rgba(230, 230, 230, 0.74)';
  const closeX = rightEdge;
  ctx.beginPath();
  ctx.moveTo(closeX - iconSize, baseY - iconSize);
  ctx.lineTo(closeX + iconSize, baseY + iconSize);
  ctx.moveTo(closeX + iconSize, baseY - iconSize);
  ctx.lineTo(closeX - iconSize, baseY + iconSize);
  ctx.stroke();

  const maxX = closeX - iconGap;
  ctx.strokeRect(maxX - iconSize, baseY - iconSize, iconSize * 2, iconSize * 2);

  const minX = maxX - iconGap;
  ctx.beginPath();
  ctx.moveTo(minX - iconSize, baseY + iconSize);
  ctx.lineTo(minX + iconSize, baseY + iconSize);
  ctx.stroke();
  ctx.restore();

  if (title) {
    ctx.save();
    ctx.fillStyle = light ? 'rgba(15, 18, 21, 0.76)' : 'rgba(236, 236, 236, 0.78)';
    ctx.font = `${Math.max(11, Math.round(headerHeight * 0.42))}px "Segoe UI", ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      title.length > 60 ? `${title.slice(0, 57)}…` : title,
      headerRect.x + headerHeight * 0.8,
      headerRect.y + headerRect.height / 2
    );
    ctx.restore();
  }

  const bodyRect = {
    x: imageRect.x,
    y: imageRect.y + headerHeight,
    width: imageRect.width,
    height: imageRect.height - headerHeight
  };
  return {
    contentRect: insetRect(bodyRect, contentPadding),
    contentRadius: windowContentRadiusFor(cornerRadius, contentPadding, headerHeight),
    contentCornerStyle: contentPadding > 0 ? 'all' : 'bottom'
  };
}

function codeEditor({ ctx, imageRect, cornerRadius, contentPadding, palette, cardWidth, title }: Parameters<FrameChrome>[0]): FrameChromeResult {
  const scale = cardWidth / 1600;
  const headerHeight = headerHeightFor(cardWidth, 38);
  const headerRect: Rect = {
    x: imageRect.x,
    y: imageRect.y,
    width: imageRect.width,
    height: headerHeight
  };

  const light = isLightPalette(palette);
  // Flat header and raised file tab make this read as editor chrome.
  const headerFill = light ? '#e9e7e1' : '#1a1c1f';
  const tabFill = light ? '#fdfdfb' : '#2a2c30';
  const headerBorder = light ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.06)';

  drawHeaderBand(
    ctx,
    imageRect,
    headerRect,
    cornerRadius,
    headerFill,
    headerBorder,
    Math.max(1, scale * 1.1)
  );
  drawWindowOuterBorder(ctx, imageRect, cornerRadius, headerBorder, Math.max(1.2, scale * 1.4));
  const controlsRight = drawTrafficLights(ctx, headerRect, scale, cornerRadius);

  // Extend the active tab to the bar bottom so it joins the editor body.
  const tabLeft = controlsRight + headerHeight * 0.7;
  const tabHeight = headerHeight * 0.78;
  const tabWidth = Math.min(headerRect.width * 0.34, headerHeight * 6.4);
  const tabRight = tabLeft + tabWidth;
  const tabY = headerRect.y + (headerHeight - tabHeight) + 1;

  ctx.save();
  drawRoundRectPath(
    ctx,
    { x: tabLeft, y: tabY, width: tabWidth, height: tabHeight + 4 },
    Math.min(8, tabHeight * 0.18)
  );
  ctx.fillStyle = tabFill;
  ctx.fill();
  ctx.strokeStyle = headerBorder;
  ctx.lineWidth = Math.max(0.75, scale * 0.85);
  ctx.stroke();
  ctx.restore();

  const dotX = tabLeft + headerHeight * 0.4;
  const tabCenterY = tabY + tabHeight * 0.52;
  const dotY = tabCenterY;
  const dotRadius = Math.max(2, headerHeight * 0.12);
  ctx.save();
  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (title) {
    ctx.save();
    ctx.fillStyle = light ? 'rgba(20, 22, 26, 0.78)' : 'rgba(230, 230, 232, 0.82)';
    ctx.font = `${Math.max(11, Math.round(headerHeight * 0.4))}px ui-monospace, "SF Mono", Menlo, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const textStart = dotX + dotRadius * 2 + headerHeight * 0.24;
    const available = tabRight - textStart - headerHeight * 0.7;
    const maxChars = Math.max(4, Math.floor(available / (headerHeight * 0.26)));
    const label = title.length > maxChars ? `${title.slice(0, maxChars - 1)}…` : title;
    ctx.fillText(label, textStart, dotY);
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = light ? 'rgba(20, 22, 26, 0.45)' : 'rgba(230, 230, 232, 0.55)';
  ctx.lineWidth = Math.max(0.85, scale * 0.85);
  ctx.lineCap = 'round';
  const closeSize = headerHeight * 0.16;
  const closeX = tabRight - headerHeight * 0.42;
  ctx.beginPath();
  ctx.moveTo(closeX - closeSize, dotY - closeSize);
  ctx.lineTo(closeX + closeSize, dotY + closeSize);
  ctx.moveTo(closeX + closeSize, dotY - closeSize);
  ctx.lineTo(closeX - closeSize, dotY + closeSize);
  ctx.stroke();
  ctx.restore();

  const bodyRect = {
    x: imageRect.x,
    y: imageRect.y + headerHeight,
    width: imageRect.width,
    height: imageRect.height - headerHeight
  };
  return {
    contentRect: insetRect(bodyRect, contentPadding),
    contentRadius: windowContentRadiusFor(cornerRadius, contentPadding, headerHeight),
    contentCornerStyle: contentPadding > 0 ? 'all' : 'bottom'
  };
}

function documentPage({ ctx, imageRect, cornerRadius, contentPadding, palette, cardWidth, title }: Parameters<FrameChrome>[0]): FrameChromeResult {
  const scale = cardWidth / 1600;
  const headerHeight = headerHeightFor(cardWidth, 24);
  const headerRect: Rect = {
    x: imageRect.x,
    y: imageRect.y,
    width: imageRect.width,
    height: headerHeight
  };

  const light = isLightPalette(palette);
  const headerFill = light
    ? mixHex(palette.background, '#ffffff', 0.6)
    : mixHex(palette.background, '#ffffff', 0.05);
  const headerBorder = light ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.05)';

  drawHeaderBand(
    ctx,
    imageRect,
    headerRect,
    cornerRadius,
    headerFill,
    headerBorder,
    Math.max(1, scale * 0.9)
  );
  drawWindowOuterBorder(ctx, imageRect, cornerRadius, headerBorder, Math.max(1, scale * 1.2));

  const dotRadius = Math.max(1.5, headerHeight * 0.1);
  const dotSpacing = dotRadius * 3.6;
  const dotY = headerRect.y + headerHeight / 2;
  const dotX0 = headerRect.x + headerHeight * 0.7;
  ctx.save();
  ctx.fillStyle = light ? 'rgba(0, 0, 0, 0.22)' : 'rgba(255, 255, 255, 0.28)';
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(dotX0 + i * dotSpacing, dotY, dotRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (title) {
    ctx.save();
    ctx.fillStyle = light ? 'rgba(20, 22, 26, 0.6)' : 'rgba(232, 232, 232, 0.6)';
    ctx.font = `${Math.max(10, Math.round(headerHeight * 0.5))}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      title.length > 80 ? `${title.slice(0, 77)}…` : title,
      headerRect.x + headerRect.width / 2,
      headerRect.y + headerHeight / 2
    );
    ctx.restore();
  }

  const bodyRect = {
    x: imageRect.x,
    y: imageRect.y + headerHeight,
    width: imageRect.width,
    height: imageRect.height - headerHeight
  };
  return {
    contentRect: insetRect(bodyRect, contentPadding),
    contentRadius: windowContentRadiusFor(cornerRadius, contentPadding, headerHeight),
    contentCornerStyle: contentPadding > 0 ? 'all' : 'bottom'
  };
}

const REGISTRY: FrameRegistry = {
  none: noneChrome,
  'minimal-browser': minimalBrowser,
  'macos-window': macOsWindow,
  'terminal-window': terminalWindow,
  'windows-window': windowsWindow,
  'code-editor': codeEditor,
  'document-page': documentPage
};

const BOX_PAINTERS: Record<MantleFrameBoxStyle, (input: FrameBoxInput) => void> = {
  none: nonePanel,
  solid: solidPanel,
  'glass-panel': glassPanel
};

export const FRAME_BOX_STYLE_IDS: readonly MantleFrameBoxStyle[] = [
  'none',
  'solid',
  'glass-panel'
];

export const FRAME_CHROME_PRESET_IDS: readonly FrameChromePreset[] = [
  'none',
  'minimal-browser',
  'macos-window',
  'terminal-window',
  'windows-window',
  'code-editor',
  'document-page'
];

export function resolveFrameBoxStyle(frame: {
  preset: MantleFramePreset;
  boxStyle?: MantleFrameBoxStyle | undefined;
}): MantleFrameBoxStyle {
  if (frame.boxStyle) return frame.boxStyle;
  return 'solid';
}

export function paintFrameBox(input: FrameBoxInput): void {
  BOX_PAINTERS[input.boxStyle](input);
}

export function resolveFrameChrome(preset: MantleFramePreset): FrameChrome {
  return REGISTRY[preset];
}
