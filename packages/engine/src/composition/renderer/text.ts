import type {
  MantleCard,
  MantlePalette,
  MantleText
} from '@mantle/schemas/model';

import type { MantleCanvasRenderingContext2D } from '../canvas';
import { mixHex } from '../palette';

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

export type TextBlockLayout = {
  items: TextBlockItem[];
  width: number;
  height: number;
};

function wrapTextLines(
  ctx: MantleCanvasRenderingContext2D,
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

export function resolveCardText(card: MantleCard): MantleText {
  return card.text;
}

export function hasVisibleText(text: MantleText): boolean {
  return text.placement !== 'none' && Boolean(text.title?.trim() || text.subtitle?.trim());
}

function resolveTextFontStack(font: MantleText['titleFont']): string {
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

export function createTextBlockLayout({
  ctx,
  text,
  palette,
  maxWidth,
  reference
}: {
  ctx: MantleCanvasRenderingContext2D;
  text: MantleText;
  palette: MantlePalette;
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

    ctx.fillStyle = item.color;
    ctx.font = item.font;
    ctx.fillText(item.text, anchorX, cursorY);
    cursorY += item.lineHeight;
  });

  ctx.restore();
}
