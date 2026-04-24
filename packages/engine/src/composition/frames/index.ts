import type {
  GlyphrameFrameBoxStyle,
  GlyphrameFramePreset
} from '@glyphrame/schemas';

import { isLightPalette, mixHex, parseHexToRgb, rgbToCss } from '../palette';
import { drawRoundRectPath } from './drawHelpers';
import type {
  FrameBoxInput,
  FrameChrome,
  FrameChromePreset,
  FrameChromeResult,
  FrameRegistry,
  Rect
} from './types';

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
  return rgbToCss(parseHexToRgb(hex, { r: 255, g: 255, b: 255 }), alpha);
}

function clampOpacityMultiplier(value: number): number {
  return Math.min(2, Math.max(0, value));
}

function drawFrostedBackdrop(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  cornerRadius: number,
  blur: number
): void {
  const margin = Math.ceil(blur * 2.5);
  const sampleX = Math.max(0, Math.floor(rect.x - margin));
  const sampleY = Math.max(0, Math.floor(rect.y - margin));
  const sampleRight = Math.min(ctx.canvas.width, Math.ceil(rect.x + rect.width + margin));
  const sampleBottom = Math.min(ctx.canvas.height, Math.ceil(rect.y + rect.height + margin));
  const sampleWidth = Math.max(1, sampleRight - sampleX);
  const sampleHeight = Math.max(1, sampleBottom - sampleY);
  const buffer = document.createElement('canvas');
  buffer.width = sampleWidth;
  buffer.height = sampleHeight;
  const bufferCtx = buffer.getContext('2d');
  if (!bufferCtx) return;

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

  ctx.save();
  drawRoundRectPath(ctx, rect, cornerRadius);
  ctx.clip();
  ctx.filter = `blur(${blur}px) saturate(1.35) contrast(1.04)`;
  ctx.drawImage(buffer, sampleX, sampleY, sampleWidth, sampleHeight);
  ctx.restore();
}

function softPanel({
  ctx,
  imageRect,
  cornerRadius,
  palette,
  cardWidth,
  boxColor,
  boxBorderColor
}: FrameBoxInput): void {
  const light = isLightPalette(palette);
  const tintColor = boxColor ?? '#ffffff';
  const edgeColor = boxBorderColor ?? (light ? '#000000' : '#ffffff');

  ctx.save();
  drawRoundRectPath(ctx, imageRect, cornerRadius);
  ctx.fillStyle = colorWithAlpha(tintColor, light ? 0.78 : 0.1);
  ctx.fill();
  ctx.lineWidth = Math.max(1, cardWidth / 1600);
  ctx.strokeStyle = colorWithAlpha(edgeColor, light ? 0.1 : 0.24);
  ctx.stroke();
  ctx.restore();
}

function glassPanel({
  ctx,
  imageRect,
  cornerRadius,
  palette,
  cardWidth,
  boxColor,
  boxBorderColor,
  boxOpacity
}: FrameBoxInput): void {
  const light = isLightPalette(palette);
  const tintColor = boxColor ?? '#ffffff';
  const edgeColor = boxBorderColor ?? '#ffffff';
  const opacity = clampOpacityMultiplier(boxOpacity ?? 1);
  const blur = Math.max(14, cardWidth * 0.018);
  drawFrostedBackdrop(ctx, imageRect, cornerRadius, blur);

  ctx.save();
  drawRoundRectPath(ctx, imageRect, cornerRadius);
  ctx.fillStyle = colorWithAlpha(tintColor, (light ? 0.26 : 0.12) * opacity);
  ctx.fill();

  ctx.lineWidth = Math.max(1.1, cardWidth / 1200);
  ctx.strokeStyle = colorWithAlpha(edgeColor, (light ? 0.78 : 0.36) * opacity);
  ctx.stroke();

  drawRoundRectPath(
    ctx,
    insetRect(imageRect, Math.max(1, cardWidth * 0.002)),
    Math.max(0, cornerRadius - 2)
  );
  ctx.lineWidth = Math.max(0.75, cardWidth / 2200);
  ctx.strokeStyle = colorWithAlpha(edgeColor, (light ? 0.18 : 0.14) * opacity);
  ctx.stroke();
  ctx.restore();
}

function solidPanel({
  ctx,
  imageRect,
  cornerRadius,
  palette,
  cardWidth,
  boxColor,
  boxBorderColor
}: FrameBoxInput): void {
  const edgeColor = boxBorderColor ?? mixHex(palette.background, palette.foreground, 0.22);

  ctx.save();
  drawRoundRectPath(ctx, imageRect, cornerRadius);
  ctx.fillStyle = boxColor ?? palette.background;
  ctx.fill();
  ctx.lineWidth = Math.max(1, cardWidth / 1700);
  ctx.strokeStyle = colorWithAlpha(edgeColor, isLightPalette(palette) ? 0.16 : 0.22);
  ctx.stroke();
  ctx.restore();
}

function nonePanel(): void {
  // The shadow pass already establishes depth; this material adds no visible body.
}

function drawTrafficLights(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  scale: number,
  palette: Parameters<FrameChrome>[0]['palette'],
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
    ctx.beginPath();
    ctx.arc(x, cy, diameter / 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = mixHex(color, isLightPalette(palette) ? '#000000' : '#000000', 0.25);
    ctx.lineWidth = Math.max(0.5, scale * 0.6);
    ctx.stroke();
  });

  return cx + (TRAFFIC_LIGHT_COLORS.length - 1) * spacing + diameter / 2;
}

function drawHeaderBand(
  ctx: CanvasRenderingContext2D,
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
  ctx: CanvasRenderingContext2D,
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
  const headerFill = light ? '#ece9e1' : '#1d1f22';
  const headerBorder = light ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.08)';
  const titleColor = light ? 'rgba(15, 18, 21, 0.72)' : 'rgba(236, 236, 236, 0.78)';

  drawHeaderBand(ctx, imageRect, headerRect, cornerRadius, headerFill, headerBorder, Math.max(1, scale * 1.2));
  drawWindowOuterBorder(ctx, imageRect, cornerRadius, headerBorder, Math.max(1.25, scale * 1.55));
  drawTrafficLights(ctx, headerRect, scale, palette, cornerRadius);

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
  const headerFill = light ? '#f3f1ea' : '#141517';
  const headerBorder = light ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.08)';

  drawHeaderBand(ctx, imageRect, headerRect, cornerRadius, headerFill, headerBorder, Math.max(1, scale * 1.1));
  drawWindowOuterBorder(ctx, imageRect, cornerRadius, headerBorder, Math.max(1.25, scale * 1.45));
  const controlsRight = drawTrafficLights(ctx, headerRect, scale, palette, cornerRadius);

  const pillLeft = Math.max(
    headerRect.x + headerRect.height * 2.6,
    controlsRight + headerRect.height * 0.55
  );
  const pillRight = headerRect.x + headerRect.width - headerRect.height * 1.2;
  const pillY = headerRect.y + headerHeight * 0.22;
  const pillHeight = headerHeight * 0.56;
  const pillWidth = pillRight - pillLeft;

  if (pillWidth >= 32) {
    ctx.save();
    drawRoundRectPath(
      ctx,
      { x: pillLeft, y: pillY, width: pillWidth, height: pillHeight },
      pillHeight / 2
    );
    ctx.fillStyle = light ? 'rgba(255, 255, 255, 0.86)' : 'rgba(255, 255, 255, 0.08)';
    ctx.fill();
    ctx.strokeStyle = light ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = Math.max(0.75, scale * 0.8);
    ctx.stroke();
    ctx.restore();
  }

  if (title && pillWidth >= 80) {
    ctx.save();
    ctx.fillStyle = light ? 'rgba(20, 24, 28, 0.72)' : 'rgba(230, 230, 230, 0.72)';
    ctx.font = `${Math.max(11, Math.round(pillHeight * 0.62))}px ui-monospace, "SF Mono", Menlo, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const maxChars = Math.max(6, Math.floor(pillWidth / (pillHeight * 0.42)));
    const text = title.length > maxChars ? `${title.slice(0, maxChars - 1)}…` : title;
    ctx.fillText(text, pillLeft + pillHeight * 0.6, headerRect.y + headerHeight / 2);
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

function terminalWindow({ ctx, imageRect, cornerRadius, contentPadding, palette, cardWidth, title }: Parameters<FrameChrome>[0]): FrameChromeResult {
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
  drawTrafficLights(ctx, headerRect, scale, palette, cornerRadius);

  ctx.save();
  ctx.fillStyle = 'rgba(180, 190, 175, 0.78)';
  ctx.font = `${Math.max(11, Math.round(headerHeight * 0.48))}px ui-monospace, "SF Mono", Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = title ? `zsh — ${title}` : 'zsh — glyphrame';
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

  // Window controls (min / max / close) on the right.
  const iconGap = Math.max(12, headerHeight * 0.9);
  const iconSize = Math.max(7, headerHeight * 0.22);
  const baseY = headerRect.y + headerRect.height / 2;
  const rightInset = headerHeight * 0.9 + Math.min(cornerRadius * 0.22, headerHeight * 0.56);
  const rightEdge = headerRect.x + headerRect.width - rightInset;

  ctx.save();
  ctx.lineWidth = Math.max(1, scale);
  ctx.strokeStyle = light ? 'rgba(20, 24, 28, 0.64)' : 'rgba(230, 230, 230, 0.74)';
  // Close (X) is drawn with a subtle red hover on larger scales.
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

const REGISTRY: FrameRegistry = {
  none: noneChrome,
  'minimal-browser': minimalBrowser,
  'macos-window': macOsWindow,
  'terminal-window': terminalWindow,
  'windows-window': windowsWindow
};

const BOX_PAINTERS: Record<GlyphrameFrameBoxStyle, (input: FrameBoxInput) => void> = {
  none: nonePanel,
  solid: solidPanel,
  'soft-panel': softPanel,
  'glass-panel': glassPanel
};

export const FRAME_BOX_STYLE_IDS: readonly GlyphrameFrameBoxStyle[] = [
  'none',
  'solid',
  'glass-panel'
];

export const FRAME_CHROME_PRESET_IDS: readonly FrameChromePreset[] = [
  'none',
  'minimal-browser',
  'macos-window',
  'terminal-window',
  'windows-window'
];

export function normalizeFrameChromePreset(
  preset: GlyphrameFramePreset
): FrameChromePreset {
  if (preset === 'soft-panel' || preset === 'glass-panel') return 'none';
  return preset;
}

export function resolveFrameBoxStyle(frame: {
  preset: GlyphrameFramePreset;
  boxStyle?: GlyphrameFrameBoxStyle | undefined;
}): GlyphrameFrameBoxStyle {
  if (frame.boxStyle === 'soft-panel') return 'glass-panel';
  if (frame.boxStyle) return frame.boxStyle;
  if (frame.preset === 'soft-panel' || frame.preset === 'glass-panel') {
    return 'glass-panel';
  }
  return 'solid';
}

export function paintFrameBox(input: FrameBoxInput): void {
  BOX_PAINTERS[input.boxStyle](input);
}

export function resolveFrameChrome(preset: GlyphrameFramePreset): FrameChrome {
  return REGISTRY[normalizeFrameChromePreset(preset)] ?? noneChrome;
}

export const FRAME_PRESET_IDS = FRAME_CHROME_PRESET_IDS;
