import { createRng, mixHex, parseHexToRgb, rgbToCss } from '../palette';
import {
  createCanvas,
  getCanvas2D,
  releaseScratchCanvas,
  type MantleCanvas,
  type MantleCanvasRenderingContext2D
} from '../canvas';
import { assertRgbaScratchBudget } from '../memoryBudget';
import type { Rect } from '../types';
import type { BackgroundGenerator } from './types';
import { clamp01, readBackgroundParam } from './utils';

const TWO_PI = Math.PI * 2;
const GLYPH_RAMP = ['.', "'", ':', '-', '~', '+', '*', '#', '%', '&', '@'];

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function mixNumber(left: number, right: number, ratio: number): number {
  return left + (right - left) * ratio;
}

function seedToInt(seed: string): number {
  let state = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 0x01000193) >>> 0;
  }
  return state >>> 0;
}

function hash1(index: number, seed: number): number {
  let state = Math.imul(index ^ seed, 0x27d4eb2d) >>> 0;
  state ^= state >>> 15;
  state = Math.imul(state, 0x85ebca6b) >>> 0;
  state ^= state >>> 13;
  return (state >>> 0) / 0xffffffff;
}

function hash2(x: number, y: number, seed: number): number {
  let state = seed ^ Math.imul(x + 0x9e3779b9, 0x85ebca6b);
  state ^= Math.imul(y + 0xc2b2ae35, 0x27d4eb2d);
  state ^= state >>> 16;
  state = Math.imul(state, 0x7feb352d) >>> 0;
  state ^= state >>> 15;
  return (state >>> 0) / 0xffffffff;
}

function valueNoise1D(x: number, seed: number): number {
  const left = Math.floor(x);
  const local = x - left;
  const eased = smoothstep(local);
  return mixNumber(hash1(left, seed), hash1(left + 1, seed), eased);
}

function fbm1D(x: number, seed: number): number {
  let value = 0;
  let amplitude = 0.52;
  let frequency = 1;
  let total = 0;

  for (let octave = 0; octave < 4; octave += 1) {
    value += valueNoise1D(x * frequency, seed + octave * 1013) * amplitude;
    total += amplitude;
    amplitude *= 0.48;
    frequency *= 2.05;
  }

  return value / total;
}

function gaussian(distance: number, width: number): number {
  return Math.exp(-(distance * distance) / Math.max(1, width * width));
}

function createLayerCanvas(width: number, height: number): MantleCanvas {
  assertRgbaScratchBudget({
    label: 'Symbol wave bloom layer',
    width,
    height,
    buffers: 1
  });
  return createCanvas(width, height);
}

function drawVignette(ctx: MantleCanvasRenderingContext2D, rect: Rect): void {
  const vignette = ctx.createRadialGradient(
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
    Math.min(rect.width, rect.height) * 0.14,
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
    Math.hypot(rect.width, rect.height) * 0.78
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.36)');
  ctx.fillStyle = vignette;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
}

function drawBloomLayer({
  ctx,
  bloomCanvas,
  glow,
  isPreview,
  scale
}: {
  ctx: MantleCanvasRenderingContext2D;
  bloomCanvas: MantleCanvas;
  glow: number;
  isPreview: boolean;
  scale: number;
}): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const farBlur = Math.max(12, scale * (70 + glow * 180));
  const nearBlur = Math.max(4, scale * (14 + glow * 42));

  ctx.globalAlpha = isPreview ? 0.62 : 0.76;
  ctx.filter = `blur(${farBlur.toFixed(2)}px)`;
  ctx.drawImage(bloomCanvas, 0, 0);

  ctx.globalAlpha = isPreview ? 0.82 : 0.94;
  ctx.filter = `blur(${nearBlur.toFixed(2)}px)`;
  ctx.drawImage(bloomCanvas, 0, 0);

  ctx.globalAlpha = 0.86;
  ctx.filter = 'none';
  ctx.drawImage(bloomCanvas, 0, 0);

  ctx.restore();
}

export const symbolWave: BackgroundGenerator = ({
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
  const rng = createRng(`symbol-wave::${seed}`);
  const seedInt = seedToInt(`symbol-wave::${seed}`);
  const time = timeMs / 1000;
  const glyphAmount = readBackgroundParam(params, 'glyphAmount', 0.62);
  const waveHeight = readBackgroundParam(params, 'waveHeight', 0.58);
  const glow = readBackgroundParam(params, 'glow', 0.84);
  const strength = clamp01(intensity || 0.76);
  const isPreview = renderMode === 'preview';

  const backgroundRgb = parseHexToRgb(palette.background);
  const coreRgb = parseHexToRgb(palette.foreground);
  const accentRgb = parseHexToRgb(palette.accent);
  const glowRgb = parseHexToRgb(mixHex(palette.accent, palette.foreground, 0.1));

  ctx.fillStyle = palette.background;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const centerWash = ctx.createRadialGradient(
    rect.x + rect.width * 0.5,
    rect.y + rect.height * 0.48,
    Math.min(rect.width, rect.height) * 0.08,
    rect.x + rect.width * 0.5,
    rect.y + rect.height * 0.48,
    Math.hypot(rect.width, rect.height) * 0.72
  );
  centerWash.addColorStop(0, rgbToCss(glowRgb, 0.035 + glow * 0.035));
  centerWash.addColorStop(0.48, rgbToCss(backgroundRgb, 0.08));
  centerWash.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = centerWash;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const fontSize = Math.max(9, scale * (17 + glyphAmount * 10));
  const cellWidth = Math.max(fontSize * 1.22, scale * (58 - glyphAmount * 26));
  const cellHeight = fontSize * (1.46 + (1 - glyphAmount) * 0.14);
  const waveAmplitude = rect.height * (0.16 + waveHeight * 0.32);
  const ridgeWidth = rect.height * (0.032 + waveHeight * 0.052);
  const haloWidth = ridgeWidth * (2.7 + glow * 0.9);
  const centerY = rect.y + rect.height * (0.5 + (rng() - 0.5) * 0.1);
  const flow = time * (0.28 + glyphAmount * 0.22 + waveHeight * 0.1);
  const phaseA = rng() * TWO_PI + flow;
  const phaseB = rng() * TWO_PI - flow * 0.72;
  const phaseC = rng() * TWO_PI + flow * 0.38;
  const tilt = (rng() - 0.5) * rect.height * 0.28;
  const clusterA = 0.18 + rng() * 0.28;
  const clusterB = 0.56 + rng() * 0.25;
  const clusterWidthA = 0.09 + rng() * 0.07;
  const clusterWidthB = 0.1 + rng() * 0.1;

  const bloomCanvas = createLayerCanvas(ctx.canvas.width, ctx.canvas.height);
  const bloomCtx = getCanvas2D(bloomCanvas);

  try {
    const font = `700 ${fontSize.toFixed(2)}px ui-monospace, "SF Mono", Menlo, monospace`;
    ctx.save();
    bloomCtx.save();
    try {
      ctx.font = font;
      bloomCtx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      bloomCtx.textAlign = 'center';
      bloomCtx.textBaseline = 'middle';

      const startY = rect.y - cellHeight;
      const endY = rect.y + rect.height + cellHeight;
      const startX = rect.x - cellWidth;
      const endX = rect.x + rect.width + cellWidth;

      for (let y = startY, row = 0; y < endY; y += cellHeight, row += 1) {
        const rowOffset = (hash2(row, 0, seedInt) - 0.5) * cellWidth * 0.58;

        for (let x = startX + rowOffset, column = 0; x < endX; x += cellWidth, column += 1) {
          const normalizedX = clamp01((x - rect.x) / rect.width);
          const noise = (fbm1D(normalizedX * 3.1 + phaseC, seedInt) - 0.5) * 2;
          const waveA = Math.sin(normalizedX * TWO_PI * 1.08 + phaseA) * 0.56;
          const waveB = Math.sin(normalizedX * TWO_PI * 2.18 + phaseB) * 0.22;
          const waveC = noise * 0.3;
          const waveY =
            centerY +
            (waveA + waveB + waveC) * waveAmplitude +
            (normalizedX - 0.5) * tilt;
          const secondaryY =
            waveY +
            Math.sin(normalizedX * TWO_PI * 1.7 + phaseB) * ridgeWidth * 1.65 +
            ridgeWidth * (1.18 + waveHeight * 0.8);

          const echoY =
            waveY -
            waveAmplitude * (0.62 + waveHeight * 0.08) -
            Math.cos(normalizedX * TWO_PI * 1.36 + phaseA) * ridgeWidth * 1.4;
          const distance = Math.abs(y - waveY);
          const secondaryDistance = Math.abs(y - secondaryY);
          const echoDistance = Math.abs(y - echoY);
          const ridgeEnergy = gaussian(distance, ridgeWidth);
          const secondaryEnergy = gaussian(secondaryDistance, ridgeWidth * 0.78) * 0.52;
          const echoEnergy = gaussian(echoDistance, ridgeWidth * 0.85) * 0.36;
          const haloEnergy = gaussian(distance, haloWidth) * 0.32;
          const clusterEnergy =
            0.74 +
            Math.min(
              0.78,
              gaussian(normalizedX - clusterA, clusterWidthA) * 0.5 +
                gaussian(normalizedX - clusterB, clusterWidthB) * 0.46
            );
          const cellNoise = hash2(column, row, seedInt);
          const fieldEnergy = clamp01(
            (ridgeEnergy + secondaryEnergy + echoEnergy + haloEnergy) * clusterEnergy
          );
          const quietAlpha = 0.028 + glyphAmount * 0.026 + cellNoise * 0.032;
          const alpha = Math.min(
            0.95,
            strength * (quietAlpha + fieldEnergy * (0.48 + glyphAmount * 0.32))
          );
          const rampEnergy = clamp01(fieldEnergy * 0.92 + cellNoise * 0.14);
          const glyphIndex = Math.min(
            GLYPH_RAMP.length - 1,
            Math.floor(rampEnergy ** 0.72 * GLYPH_RAMP.length)
          );
          const glyph = GLYPH_RAMP[glyphIndex] ?? '.';
          const jitterX = (hash2(column, row + 17, seedInt) - 0.5) * cellWidth * 0.14;
          const jitterY = (hash2(column + 23, row, seedInt) - 0.5) * cellHeight * 0.12;
          const drawX = x + jitterX;
          const drawY = y + jitterY;

          // High-energy ridge cells blend farther toward the accent color.
          const positionRatio = normalizedX ** 1.2;
          const ridgeTint = fieldEnergy ** 0.55 * 0.55;
          const tintRatio = Math.min(0.92, positionRatio * 0.42 + ridgeTint);
          const tintR = Math.round(coreRgb.r + (accentRgb.r - coreRgb.r) * tintRatio);
          const tintG = Math.round(coreRgb.g + (accentRgb.g - coreRgb.g) * tintRatio);
          const tintB = Math.round(coreRgb.b + (accentRgb.b - coreRgb.b) * tintRatio);
          ctx.fillStyle = `rgba(${tintR}, ${tintG}, ${tintB}, ${alpha.toFixed(3)})`;
          ctx.fillText(glyph, drawX, drawY);

          if (fieldEnergy > 0.16) {
            const bloomAlpha = Math.min(
              0.9,
              strength * (fieldEnergy ** 1.28) * (0.46 + glow * 0.54)
            );
            bloomCtx.fillStyle = rgbToCss(glowRgb, bloomAlpha);
            bloomCtx.fillText(glyph, drawX, drawY);
          }
        }
      }
    } finally {
      bloomCtx.restore();
      ctx.restore();
    }

    drawBloomLayer({
      ctx,
      bloomCanvas,
      glow,
      isPreview,
      scale
    });
  } finally {
    releaseScratchCanvas(bloomCanvas);
  }

  drawVignette(ctx, rect);
};
