import { createRng, isLightPalette, mixHex, parseHexToRgb, rgbToCss } from '../palette';
import type { BackgroundGenerator } from './types';

/**
 * Terminal scanline glow — dark scanline grid with a subtle horizontal glow.
 * Tech/editorial family. Reads as a CRT phosphor screen.
 */
export const terminalScanline: BackgroundGenerator = ({
  ctx,
  rect,
  palette,
  intensity,
  params,
  seed,
  scale
}) => {
  const scanlineRng = createRng(`terminal-scanline::scanlines::${seed}`);
  const sweepRng = createRng(`terminal-scanline::sweep::${seed}`);
  const glyphRng = createRng(`terminal-scanline::glyphs::${seed}`);
  const param = (id: string, fallback: number) =>
    Math.min(1, Math.max(0, params[id] ?? fallback));
  const scanlineDensity = param('scanlineDensity', intensity);
  const glyphDensity = param('glyphDensity', Math.min(1, intensity * 0.58));
  const sweepGlow = param('sweepGlow', intensity);

  // Base gradient — slightly warmer in the center, deeper at the edges.
  const centerGradient = ctx.createRadialGradient(
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
    rect.width * 0.05,
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
    Math.hypot(rect.width, rect.height) * 0.62
  );
  centerGradient.addColorStop(0, mixHex(palette.background, palette.accent, 0.09 + sweepGlow * 0.12));
  centerGradient.addColorStop(0.55, palette.background);
  centerGradient.addColorStop(1, mixHex(palette.background, '#000000', 0.38 + sweepGlow * 0.22));
  ctx.fillStyle = centerGradient;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  // Horizontal scanlines.
  const lineSpacing = Math.max(2, Math.round((5 - scanlineDensity * 3) * scale));
  const lineThickness = Math.max(1, Math.round(scale * (0.48 + scanlineDensity * 0.72)));
  const glowRgb = parseHexToRgb(palette.accent);
  const baseAlpha = 0.025 + scanlineDensity * 0.13;

  ctx.save();
  for (let y = rect.y; y < rect.y + rect.height; y += lineSpacing) {
    const flicker = 0.75 + scanlineRng() * 0.25;
    ctx.fillStyle = rgbToCss(glowRgb, baseAlpha * flicker);
    ctx.fillRect(rect.x, y, rect.width, lineThickness);
  }
  ctx.restore();

  // Occasional horizontal glow band — reads like a slow sweep.
  const bands = Math.max(1, Math.round(1 + sweepGlow * 5));
  for (let i = 0; i < bands; i += 1) {
    const bandHeight = rect.height * (0.05 + sweepRng() * (0.1 + sweepGlow * 0.1));
    const bandCenter = rect.y + sweepRng() * rect.height;
    const bandY = Math.min(
      rect.y + rect.height - bandHeight,
      Math.max(rect.y, bandCenter - bandHeight / 2)
    );
    const bandGradient = ctx.createLinearGradient(0, bandY, 0, bandY + bandHeight);
    bandGradient.addColorStop(0, rgbToCss(glowRgb, 0));
    bandGradient.addColorStop(0.5, rgbToCss(glowRgb, 0.025 + 0.09 * sweepGlow));
    bandGradient.addColorStop(1, rgbToCss(glowRgb, 0));
    ctx.fillStyle = bandGradient;
    ctx.fillRect(rect.x, bandY, rect.width, bandHeight);
  }

  if (glyphDensity <= 0.001) {
    drawVignette(ctx, rect);
    return;
  }

  // Sparse glyph rain — deterministic monospace characters at low opacity.
  const glyphRamp = ['0', '1', '/', '\\', '|', '-', '·', ':', '>', '#'];
  const cellWidth = Math.max(12, Math.round((20 - glyphDensity * 7) * scale));
  const cellHeight = Math.round(cellWidth * 1.6);
  const glyphAlpha = (isLightPalette(palette) ? 0.12 : 0.16) * (0.35 + glyphDensity * 1.25);
  const glyphRgb = parseHexToRgb(palette.foreground);

  ctx.save();
  ctx.font = `${Math.round(cellWidth * 0.9)}px ui-monospace, "SF Mono", Menlo, monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = rgbToCss(glyphRgb, glyphAlpha);

  for (let y = rect.y; y < rect.y + rect.height; y += cellHeight) {
    for (let x = rect.x; x < rect.x + rect.width; x += cellWidth) {
      if (glyphRng() > 0.04 + glyphDensity * 0.3) continue;
      const glyph = glyphRamp[Math.floor(glyphRng() * glyphRamp.length)] ?? '·';
      ctx.fillText(glyph, x, y);
    }
  }
  ctx.restore();

  drawVignette(ctx, rect);
};

function drawVignette(
  ctx: CanvasRenderingContext2D,
  rect: Parameters<BackgroundGenerator>[0]['rect']
): void {
  const vignette = ctx.createRadialGradient(
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
    rect.width * 0.3,
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
    Math.hypot(rect.width, rect.height) * 0.75
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
  ctx.fillStyle = vignette;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
}
