import type {
  MantleBackgroundPresetId,
  MantleCard,
  MantlePalette,
  MantleText,
  MantleTextFont,
  MantleTextLayer
} from '@mantle/schemas/model';

import type { MantleCanvasRenderingContext2D } from '../canvas';
import { mixHex, parseHexToRgb, rgbToCss } from '../palette';

type TextLineStyle = {
  font: string;
  color: string;
  fontSize: number;
  letterSpacing: number;
  shadow?: TextShadow | undefined;
};

type TextShadow = {
  color: string;
  blurPx: number;
};

type TextBlockItem =
  | {
      type: 'line';
      text: string;
      style: TextLineStyle;
      lineHeight: number;
    }
  | {
      type: 'spacer';
      height: number;
    };

export type TextBlockLayout = {
  items: TextBlockItem[];
  width: number;
  height: number;
};

const FONT_WEIGHT_TITLE = 600;
const FONT_WEIGHT_SUBTITLE = 500;

// Background presets where the title visibly competes with high-frequency or
// strongly coloured texture. On these we apply a subtle shadow even with the
// `auto` setting so headlines lift off the surface cleanly.
const SHADOW_RECOMMENDED_BACKGROUNDS = new Set<MantleBackgroundPresetId>([
  'aurora-gradient',
  'marbling',
  'smoke-veil',
  'symbol-wave',
  'signal-field',
  'falling-pattern',
  'terminal-scanline',
  'image-fill'
]);

function setCanvasFontStyle(
  ctx: MantleCanvasRenderingContext2D,
  style: TextLineStyle
): void {
  ctx.font = style.font;
  // letterSpacing / fontKerning are widely available in Chrome 99+, Safari 16+,
  // Firefox 138+; falling back silently is fine since the property assignment
  // is a no-op when unsupported.
  const ctxAny = ctx as unknown as {
    letterSpacing?: string;
    fontKerning?: 'auto' | 'normal' | 'none';
  };
  ctxAny.letterSpacing = `${style.letterSpacing}px`;
  ctxAny.fontKerning = 'normal';
}

function measureLineWidth(
  ctx: MantleCanvasRenderingContext2D,
  style: TextLineStyle,
  text: string
): number {
  setCanvasFontStyle(ctx, style);
  return ctx.measureText(text).width;
}

function wrapTextLines(
  ctx: MantleCanvasRenderingContext2D,
  style: TextLineStyle,
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
      if (chunk && measureLineWidth(ctx, style, next) > maxWidth) {
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
    if (measureLineWidth(ctx, style, next) > maxWidth && line) {
      lines.push(line);
      line = word;
      if (measureLineWidth(ctx, style, line) > maxWidth) {
        pushLongWord(line);
      }
    } else if (!line && measureLineWidth(ctx, style, word) > maxWidth) {
      pushLongWord(word);
    } else {
      line = next;
    }
  }

  if (line) lines.push(line);

  // Anti-orphan pass: if the last line is a single short word and the line
  // before it has at least three words, demote the trailing word so the last
  // line doesn't sit alone like a typo.
  if (lines.length >= 2) {
    const last = lines[lines.length - 1]!;
    const beforeLast = lines[lines.length - 2]!;
    const beforeWords = beforeLast.split(' ');
    const isOrphan =
      !last.includes(' ') &&
      last.length <= 6 &&
      beforeWords.length >= 3;
    if (isOrphan) {
      const moveWord = beforeWords.pop()!;
      const candidateBefore = beforeWords.join(' ');
      const candidateLast = `${moveWord} ${last}`;
      if (measureLineWidth(ctx, style, candidateLast) <= maxWidth) {
        lines[lines.length - 2] = candidateBefore;
        lines[lines.length - 1] = candidateLast;
      }
    }
  }

  return lines;
}

export function resolveCardText(card: MantleCard): MantleText {
  return card.text;
}

export function hasVisibleText(text: MantleText): boolean {
  return text.placement !== 'none' && Boolean(text.title?.trim() || text.subtitle?.trim());
}

export function hasVisibleTextLayer(layer: MantleTextLayer): boolean {
  return Boolean(layer.text.trim());
}

function resolveTextFontStack(font: MantleTextFont): string {
  switch (font) {
    case 'system':
      return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    case 'display':
      return '"Fraunces Variable", "Fraunces", "New York", "Iowan Old Style", Georgia, serif';
    case 'rounded':
      return '"Nunito Variable", "Nunito", ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
    case 'serif':
      return 'ui-serif, Georgia, "Times New Roman", serif';
    case 'editorial':
      return '"Instrument Serif", "New York", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
    case 'slab':
      return '"Roboto Slab Variable", "Roboto Slab", Rockwell, "Courier New", ui-serif, serif';
    case 'mono':
      return '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    case 'code':
      return '"JetBrains Mono", "SF Mono", "Cascadia Code", "Fira Code", ui-monospace, monospace';
    case 'condensed':
      return '"Arial Narrow", "Helvetica Neue Condensed", "Roboto Condensed", Arial, sans-serif';
    case 'sans':
    default:
      return '"Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  }
}

/**
 * Optical letter-spacing for Canvas text. Matches the `letter-spacing` rules
 * editorial typography uses: tighter as size grows for sans/serif headlines,
 * slightly looser for monospace and condensed where uniform spacing reads
 * better.
 */
function resolveLetterSpacingPx(font: MantleTextFont, fontSize: number, role: 'title' | 'subtitle'): number {
  if (font === 'mono' || font === 'code') {
    return fontSize * (role === 'title' ? 0.005 : 0.01);
  }
  if (font === 'condensed') {
    return fontSize * 0.012;
  }
  if (role === 'subtitle') {
    return fontSize * -0.006;
  }
  // Title: tighter as size grows. At 32px → -0.012em, at 80px → -0.022em.
  const norm = Math.min(1, Math.max(0, (fontSize - 24) / 80));
  const ems = -0.012 - norm * 0.012;
  return fontSize * ems;
}

function shouldRenderShadow(
  shadowSetting: MantleText['shadow'],
  backgroundPresetId: MantleBackgroundPresetId
): boolean {
  if (shadowSetting === 'on') return true;
  if (shadowSetting === 'off') return false;
  return SHADOW_RECOMMENDED_BACKGROUNDS.has(backgroundPresetId);
}

function resolveTitleShadow(
  enabled: boolean,
  palette: MantlePalette,
  fontSize: number
): TextShadow | undefined {
  if (!enabled) return undefined;
  const rgb = parseHexToRgb(mixHex(palette.background, '#000000', 0.4));
  return {
    color: rgbToCss(rgb, 0.42),
    blurPx: Math.max(6, fontSize * 0.18)
  };
}

function resolveSubtitleShadow(
  enabled: boolean,
  palette: MantlePalette,
  fontSize: number
): TextShadow | undefined {
  if (!enabled) return undefined;
  const rgb = parseHexToRgb(mixHex(palette.background, '#000000', 0.32));
  return {
    color: rgbToCss(rgb, 0.34),
    blurPx: Math.max(4, fontSize * 0.14)
  };
}

export function createTextBlockLayout({
  ctx,
  text,
  palette,
  maxWidth,
  reference,
  backgroundPresetId
}: {
  ctx: MantleCanvasRenderingContext2D;
  text: MantleText;
  palette: MantlePalette;
  maxWidth: number;
  reference: number;
  backgroundPresetId: MantleBackgroundPresetId;
}): TextBlockLayout {
  const items: TextBlockItem[] = [];
  const title = text.title?.trim();
  const subtitle = text.subtitle?.trim();
  const titleSize = Math.max(32, Math.round(reference * 0.04 * text.scale));
  const subtitleSize = Math.max(17, Math.round(reference * 0.02 * text.scale));
  const titleFontStack = resolveTextFontStack(text.titleFont);
  const subtitleFontStack = resolveTextFontStack(text.subtitleFont);
  const titleColor = text.titleColor ?? palette.foreground;
  const mutedColor = palette.muted ?? mixHex(palette.foreground, palette.background, 0.4);
  const subtitleColor = text.subtitleColor ?? mutedColor;
  const shadowEnabled = shouldRenderShadow(text.shadow, backgroundPresetId);

  const titleStyle: TextLineStyle = {
    font: `${FONT_WEIGHT_TITLE} ${titleSize}px ${titleFontStack}`,
    color: titleColor,
    fontSize: titleSize,
    letterSpacing: resolveLetterSpacingPx(text.titleFont, titleSize, 'title'),
    shadow: resolveTitleShadow(shadowEnabled, palette, titleSize)
  };
  const subtitleStyle: TextLineStyle = {
    font: `${FONT_WEIGHT_SUBTITLE} ${subtitleSize}px ${subtitleFontStack}`,
    color: subtitleColor,
    fontSize: subtitleSize,
    letterSpacing: resolveLetterSpacingPx(text.subtitleFont, subtitleSize, 'subtitle'),
    shadow: resolveSubtitleShadow(shadowEnabled, palette, subtitleSize)
  };

  if (title) {
    const wrappedTitle = wrapTextLines(ctx, titleStyle, title, maxWidth);
    // Tighter line-height for single-line, more breathing room when the title
    // wraps to multiple lines so it doesn't read as a wall of letters.
    const titleLineHeight = wrappedTitle.length <= 1 ? titleSize * 1.06 : titleSize * 1.16;
    wrappedTitle.forEach((line) => {
      items.push({
        type: 'line',
        text: line,
        style: titleStyle,
        lineHeight: titleLineHeight
      });
    });
  }

  if (title && subtitle) {
    items.push({ type: 'spacer', height: Math.max(10, subtitleSize * 0.78) });
  }

  if (subtitle) {
    wrapTextLines(ctx, subtitleStyle, subtitle, maxWidth).forEach((line) => {
      items.push({
        type: 'line',
        text: line,
        style: subtitleStyle,
        lineHeight: subtitleSize * 1.42
      });
    });
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

export function createTextLayerBlockLayout({
  ctx,
  layer,
  palette,
  maxWidth,
  reference,
  backgroundPresetId
}: {
  ctx: MantleCanvasRenderingContext2D;
  layer: MantleTextLayer;
  palette: MantlePalette;
  maxWidth: number;
  reference: number;
  backgroundPresetId: MantleBackgroundPresetId;
}): TextBlockLayout {
  const layout = createTextBlockLayout({
    ctx,
    text: {
      placement: 'free',
      align: layer.align,
      titleFont: layer.font,
      subtitleFont: layer.font,
      titleColor: layer.color,
      title: layer.text,
      scale: layer.scale,
      width: layer.width,
      gap: 0,
      shadow: layer.shadow,
      transform: layer.transform
    },
    palette,
    maxWidth,
    reference,
    backgroundPresetId
  });

  if (layout.items.length > 0) return layout;

  const placeholderSize = Math.max(32, Math.round(reference * 0.04 * layer.scale));
  return {
    items: [],
    width: maxWidth,
    height: placeholderSize * 1.06
  };
}

export function drawTextBlock({
  ctx,
  layout,
  x,
  y,
  align
}: {
  ctx: MantleCanvasRenderingContext2D;
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

    setCanvasFontStyle(ctx, item.style);
    if (item.style.shadow) {
      ctx.shadowColor = item.style.shadow.color;
      ctx.shadowBlur = item.style.shadow.blurPx;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = Math.max(1, item.style.fontSize * 0.04);
    } else {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
    ctx.fillStyle = item.style.color;
    ctx.fillText(item.text, anchorX, cursorY);
    cursorY += item.lineHeight;
  });

  ctx.restore();
}
