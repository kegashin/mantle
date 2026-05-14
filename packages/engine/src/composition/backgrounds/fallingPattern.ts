import { createRng, mixHex, parseHexToRgb, rgbToCss } from '../palette';
import type { MantleCanvasRenderingContext2D } from '../canvas';
import type { Rect } from '../types';
import type { BackgroundGenerator } from './types';
import { readBackgroundParam } from './utils';

const GLYPHS = ['0', '1', '/', '\\', '|', '-', '+', '*', ':', '.', '<', '>', '#', '%'];

function drawBase(
  ctx: MantleCanvasRenderingContext2D,
  rect: Rect,
  background: string,
  accent: string,
  glow: number
): void {
  const reach = Math.hypot(rect.width, rect.height);
  const accentRgb = parseHexToRgb(accent);
  const base = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height);
  base.addColorStop(0, mixHex(background, accent, 0.08 + glow * 0.04));
  base.addColorStop(0.42, background);
  base.addColorStop(1, mixHex(background, '#000000', 0.56 + glow * 0.16));
  ctx.fillStyle = base;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const wash = ctx.createRadialGradient(
    rect.x + rect.width * 0.56,
    rect.y + rect.height * 0.2,
    0,
    rect.x + rect.width * 0.56,
    rect.y + rect.height * 0.2,
    reach * 0.7
  );
  wash.addColorStop(0, rgbToCss(accentRgb, 0.12 + glow * 0.12));
  wash.addColorStop(1, rgbToCss(accentRgb, 0));
  ctx.fillStyle = wash;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
}

function drawColumnBeam({
  ctx,
  rect,
  x,
  color,
  glow,
  scale
}: {
  ctx: MantleCanvasRenderingContext2D;
  rect: Rect;
  x: number;
  color: string;
  glow: number;
  scale: number;
}): void {
  const rgb = parseHexToRgb(color);
  const beam = ctx.createLinearGradient(x, rect.y, x, rect.y + rect.height);
  beam.addColorStop(0, rgbToCss(rgb, 0));
  beam.addColorStop(0.3, rgbToCss(rgb, 0.05 + glow * 0.08));
  beam.addColorStop(0.54, rgbToCss(rgb, 0.11 + glow * 0.12));
  beam.addColorStop(1, rgbToCss(rgb, 0));

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = beam;
  ctx.lineWidth = Math.max(0.75, scale * (0.8 + glow * 1.7));
  ctx.shadowColor = rgbToCss(rgb, 0.22 + glow * 0.24);
  ctx.shadowBlur = Math.max(4, scale * (8 + glow * 16));
  ctx.beginPath();
  ctx.moveTo(x, rect.y);
  ctx.lineTo(x, rect.y + rect.height);
  ctx.stroke();
  ctx.restore();
}

function drawColumnGlyphs({
  ctx,
  rect,
  x,
  headY,
  stepY,
  trailCount,
  fontSize,
  seedOffset,
  coreColor,
  trailColor,
  glowColor,
  glow
}: {
  ctx: MantleCanvasRenderingContext2D;
  rect: Rect;
  x: number;
  headY: number;
  stepY: number;
  trailCount: number;
  fontSize: number;
  seedOffset: number;
  coreColor: string;
  trailColor: string;
  glowColor: string;
  glow: number;
}): void {
  const coreRgb = parseHexToRgb(coreColor);
  const trailRgb = parseHexToRgb(trailColor);
  const glowRgb = parseHexToRgb(glowColor);

  for (let index = trailCount; index >= 0; index -= 1) {
    const y = headY - index * stepY;
    if (y < rect.y - stepY || y > rect.y + rect.height + stepY) continue;

    const glyph = GLYPHS[(seedOffset + index * 7) % GLYPHS.length]!;
    const age = index / Math.max(1, trailCount);
    const alpha = (1 - age) ** 1.45;
    const isHead = index === 0;

    if (isHead) {
      ctx.save();
      ctx.shadowColor = rgbToCss(glowRgb, 0.5 + glow * 0.28);
      ctx.shadowBlur = Math.max(4, fontSize * (0.65 + glow * 1.2));
      ctx.fillStyle = rgbToCss(coreRgb, 0.78 + glow * 0.18);
      ctx.fillText(glyph, x, y);
      ctx.restore();
      continue;
    }

    ctx.fillStyle = rgbToCss(trailRgb, 0.06 + alpha * (0.38 + glow * 0.18));
    ctx.fillText(glyph, x, y);
  }
}

export const fallingPattern: BackgroundGenerator = ({
  ctx,
  rect,
  palette,
  intensity,
  params,
  seed,
  renderMode,
  timeMs,
  scale
}) => {
  const rng = createRng(`falling-pattern::${seed}`);
  const time = timeMs / 1000;
  const glyphDensity = readBackgroundParam(params, 'glyphDensity', 0.52);
  const trail = readBackgroundParam(params, 'sweepGlow', 0.62);
  const glow = readBackgroundParam(params, 'glow', intensity);
  const preview = renderMode === 'preview';
  const fontSize = Math.max(9, scale * (13 + glyphDensity * 10));
  const columnWidth = Math.max(fontSize * 1.25, scale * (42 - glyphDensity * 18));
  const stepY = fontSize * (1.16 + (1 - glyphDensity) * 0.18);
  const trailCount = Math.round(5 + trail * 18);
  const columnCount = Math.ceil(rect.width / columnWidth) + 2;
  const loopHeight = rect.height + stepY * (trailCount + 2);
  const fallSpeed = stepY * (2.4 + glyphDensity * 3.2 + trail * 1.6);

  drawBase(ctx, rect, palette.background, palette.accent, glow);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.font = `700 ${fontSize.toFixed(2)}px ui-monospace, "SF Mono", Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let column = -1; column < columnCount; column += 1) {
    if (preview && column % 2 === 1 && glyphDensity < 0.38) continue;
    const x = rect.x + column * columnWidth + rng() * columnWidth * 0.72;
    const lanePhase = rng() * loopHeight;
    const laneSpeed = fallSpeed * (0.72 + rng() * 0.56);
    const headY =
      rect.y -
      stepY +
      ((lanePhase + time * laneSpeed) % loopHeight);
    const brightness = 0.58 + rng() * 0.42;

    if (rng() > 0.34) {
      drawColumnBeam({
        ctx,
        rect,
        x,
        color: column % 3 === 0 ? palette.muted ?? palette.accent : palette.accent,
        glow,
        scale
      });
    }

    ctx.globalAlpha = brightness;
    drawColumnGlyphs({
      ctx,
      rect,
      x,
      headY,
      stepY,
      trailCount,
      fontSize,
      seedOffset: Math.floor(rng() * 1000 + time * (2.5 + glyphDensity * 5)),
      coreColor: palette.foreground,
      trailColor: palette.accent,
      glowColor: mixHex(palette.accent, palette.foreground, 0.24),
      glow
    });
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const shade = ctx.createRadialGradient(
    rect.x + rect.width * 0.5,
    rect.y + rect.height * 0.5,
    Math.min(rect.width, rect.height) * 0.2,
    rect.x + rect.width * 0.5,
    rect.y + rect.height * 0.5,
    Math.hypot(rect.width, rect.height) * 0.72
  );
  shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.44)');
  ctx.fillStyle = shade;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
};
