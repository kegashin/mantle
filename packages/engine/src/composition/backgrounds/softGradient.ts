import {
  createRng,
  isLightPalette,
  mixHex,
  parseHexToRgb,
  relativeLuminance,
  rgbToCss
} from '../palette';
import type { MantleCanvasRenderingContext2D } from '../canvas';
import type { Rect } from '../types';
import type { BackgroundGenerator } from './types';
import {
  clamp01,
  drawPixelGrain,
  readBackgroundParam,
  resolveProvidedBackgroundColors
} from './utils';

const TWO_PI = Math.PI * 2;

function mixColorGroup(colors: string[], fallback: string): string {
  if (colors.length === 0) return fallback;

  return colors.reduce((mixed, color, index) => {
    if (index === 0) return color;
    return mixHex(mixed, color, 1 / (index + 1));
  }, colors[0]!);
}

function colorVisibilityWeight(color: string, averageLuminance: number, light: boolean): number {
  const luminance = relativeLuminance(color);
  const dominance = light ? averageLuminance - luminance : luminance - averageLuminance;
  return Math.min(1.14, Math.max(0.7, 1 - dominance * 0.58));
}

function addRadialWash(
  ctx: MantleCanvasRenderingContext2D,
  rect: Rect,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha: number,
  midPoint = 0.45
): void {
  const rgb = parseHexToRgb(color);
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, rgbToCss(rgb, alpha));
  gradient.addColorStop(midPoint, rgbToCss(rgb, alpha * 0.42));
  gradient.addColorStop(1, rgbToCss(rgb, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
}

function addEllipticWash({
  ctx,
  x,
  y,
  radiusX,
  radiusY,
  rotation,
  color,
  alpha,
  midPoint = 0.38
}: {
  ctx: MantleCanvasRenderingContext2D;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
  color: string;
  alpha: number;
  midPoint?: number;
}): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(Math.max(1, radiusX), Math.max(1, radiusY));
  const rgb = parseHexToRgb(color);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, rgbToCss(rgb, alpha));
  gradient.addColorStop(midPoint, rgbToCss(rgb, alpha * 0.52));
  gradient.addColorStop(1, rgbToCss(rgb, 0));
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TWO_PI);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();
}

function drawOrganicBlob({
  ctx,
  rect,
  x,
  y,
  radiusX,
  radiusY,
  rotation,
  color,
  alpha,
  irregularity,
  blur,
  detail,
  rng
}: {
  ctx: MantleCanvasRenderingContext2D;
  rect: Rect;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
  color: string;
  alpha: number;
  irregularity: number;
  blur: number;
  detail: number;
  rng: () => number;
}): void {
  const rgb = parseHexToRgb(color);
  const steps = detail;
  const phaseA = rng() * Math.PI * 2;
  const phaseB = rng() * Math.PI * 2;
  const cosRotation = Math.cos(rotation);
  const sinRotation = Math.sin(rotation);
  const maxRadius = Math.max(radiusX, radiusY);
  const drawWash = (
    centerX: number,
    centerY: number,
    radius: number,
    washAlpha: number,
    midPoint: number
  ) => {
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, rgbToCss(rgb, washAlpha));
    gradient.addColorStop(midPoint, rgbToCss(rgb, washAlpha * 0.38));
    gradient.addColorStop(1, rgbToCss(rgb, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  };

  ctx.save();
  drawWash(x, y, maxRadius * (1.1 + blur * 0.006), alpha, 0.34);

  for (let i = 0; i < steps; i += 1) {
    const theta = (i / steps) * Math.PI * 2;
    const wobble =
      1 +
      Math.sin(theta * 2 + phaseA) * irregularity * 0.38 +
      Math.sin(theta * 3 + phaseB) * irregularity * 0.24 +
      (rng() - 0.5) * irregularity * 0.34;
    const localX = Math.cos(theta) * radiusX * wobble * 0.52;
    const localY = Math.sin(theta) * radiusY * wobble * 0.52;
    const centerX = x + localX * cosRotation - localY * sinRotation;
    const centerY = y + localX * sinRotation + localY * cosRotation;
    const radius =
      maxRadius *
      (0.34 + rng() * 0.18 + irregularity * 0.18 + blur * 0.002);

    drawWash(centerX, centerY, radius, alpha * (0.26 + rng() * 0.12), 0.42);
  }
  ctx.restore();
}

function resolveGradientColors(
  colors: string[] | undefined,
  palette: Parameters<BackgroundGenerator>[0]['palette']
): string[] {
  const resolved = resolveProvidedBackgroundColors(colors);
  if (resolved) return resolved;

  return [
    palette.background,
    palette.accent,
    palette.muted ?? mixHex(palette.background, palette.foreground, 0.35),
    mixHex(palette.background, '#000000', 0.18)
  ];
}

export const softGradient: BackgroundGenerator = ({
  ctx,
  rect,
  palette,
  colors,
  intensity,
  params,
  seed,
  renderMode,
  scale
}) => {
  const rng = createRng(`soft-gradient::${seed}`);
  const isPreview = renderMode === 'preview';
  const light = isLightPalette(palette);
  const angle = readBackgroundParam(params, 'angle', 0.58) * Math.PI * 2;
  const spread = readBackgroundParam(params, 'spread', 0.58);
  const glow = readBackgroundParam(params, 'glow', 0.46);
  const grain = readBackgroundParam(params, 'grain', 0.08);
  const strength = clamp01(intensity || 0.72);
  const gradientColors = resolveGradientColors(colors, palette);
  const shapeSize = 0.42 + spread * 0.18;
  const shapeDrift = 0.24 + spread * 0.34;
  const averageLuminance =
    gradientColors.reduce((sum, color) => sum + relativeLuminance(color), 0) /
    gradientColors.length;

  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const reach = Math.hypot(rect.width, rect.height);
  const dx = Math.cos(angle) * reach;
  const dy = Math.sin(angle) * reach;

  const mixedTone = mixColorGroup(gradientColors, palette.background);
  const baseTone = mixHex(mixedTone, palette.background, 0.18);
  const shadowTone = mixHex(
    baseTone,
    '#000000',
    light ? 0.05 : 0.24
  );

  const base = ctx.createLinearGradient(
    centerX - dx / 2,
    centerY - dy / 2,
    centerX + dx / 2,
    centerY + dy / 2
  );
  base.addColorStop(0, shadowTone);
  gradientColors.forEach((color, index) => {
    const stop = gradientColors.length === 1 ? 0.5 : index / (gradientColors.length - 1);
    const easedStop = 0.08 + stop * 0.84;
    base.addColorStop(easedStop, mixHex(color, baseTone, 0.38));
  });
  base.addColorStop(1, mixHex(mixedTone, baseTone, 0.22));
  ctx.fillStyle = base;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const spotlightColor = mixHex(
    gradientColors[1] ?? palette.accent,
    '#ffffff',
    light ? 0.18 : 0.08
  );
  addRadialWash(
    ctx,
    rect,
    centerX - dx * 0.16,
    centerY - dy * 0.12,
    reach * (0.34 + spread * 0.18),
    spotlightColor,
    (light ? 0.12 : 0.16) * strength * (0.55 + glow * 0.35),
    0.22
  );

  ctx.save();
  ctx.globalCompositeOperation = light ? 'source-over' : 'screen';

  const shortSide = Math.min(rect.width, rect.height);
  const glowAlpha = (light ? 0.1 : 0.18) * strength * (0.42 + glow);
  const blobAlpha = (light ? 0.13 : 0.21) * strength * (0.58 + glow * 0.34);
  const blobBlur = Math.max(18, scale * shortSide * (0.035 + glow * 0.05));
  const blobColors = gradientColors;
  const blobDetail = isPreview ? 5 : 9;

  blobColors.forEach((color, index) => {
    const visibility = colorVisibilityWeight(color, averageLuminance, light);
    const turn =
      angle +
      index * 2.399963229728653 +
      (rng() - 0.5) * (0.62 + shapeDrift * 0.42);
    const drift = 0.08 + shapeDrift * (0.26 + rng() * 0.16);
    const x =
      centerX +
      Math.cos(turn) * rect.width * drift +
      Math.sin(index * 1.7 + angle) * rect.width * shapeDrift * 0.05;
    const y =
      centerY +
      Math.sin(turn * 0.86) * rect.height * drift +
      Math.cos(index * 1.2 + angle) * rect.height * shapeDrift * 0.06;
    const radiusX =
      shortSide * (0.26 + shapeSize * 0.42 + spread * 0.1) * (0.9 + rng() * 0.48);
    const radiusY =
      shortSide * (0.2 + shapeSize * 0.34 + spread * 0.08) * (0.72 + rng() * 0.58);
    const rotation = angle + (rng() - 0.5) * Math.PI * 0.85 + index * 0.34;
    const irregularity = 0.12 + shapeDrift * 0.36;

    addEllipticWash({
      ctx,
      x,
      y,
      radiusX: radiusX * (1.35 + glow * 0.28),
      radiusY: radiusY * (1.25 + glow * 0.24),
      rotation,
      color,
      alpha: glowAlpha * visibility * 0.82,
      midPoint: 0.2 + spread * 0.16
    });

    addRadialWash(
      ctx,
      rect,
      x,
      y,
      Math.max(radiusX, radiusY) * (1.05 + glow * 0.56),
      color,
      glowAlpha * visibility,
      0.24 + spread * 0.2
    );
    drawOrganicBlob({
      ctx,
      rect,
      x,
      y,
      radiusX,
      radiusY,
      rotation,
      color,
      alpha: blobAlpha * visibility * 0.72,
      irregularity,
      blur: blobBlur,
      detail: blobDetail,
      rng
    });
    if (!isPreview || index < 2) {
      drawOrganicBlob({
        ctx,
        rect,
        x: x + Math.cos(turn + Math.PI * 0.42) * radiusX * (0.24 + shapeDrift * 0.22),
        y: y + Math.sin(turn + Math.PI * 0.42) * radiusY * (0.2 + shapeDrift * 0.18),
        radiusX: radiusX * (0.34 + rng() * 0.18),
        radiusY: radiusY * (0.3 + rng() * 0.22),
        rotation: rotation - 0.85,
        color,
        alpha: blobAlpha * 0.34 * visibility,
        irregularity: irregularity * 1.2,
        blur: blobBlur * 0.72,
        detail: blobDetail,
        rng
      });
    }
  });
  ctx.restore();

  const depthShade = ctx.createRadialGradient(
    centerX + dx * 0.16,
    centerY + dy * 0.12,
    shortSide * 0.18,
    centerX + dx * 0.18,
    centerY + dy * 0.14,
    reach * 0.78
  );
  depthShade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  depthShade.addColorStop(1, `rgba(0, 0, 0, ${light ? 0.08 : 0.22})`);
  ctx.fillStyle = depthShade;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  ctx.save();
  ctx.globalCompositeOperation = light ? 'overlay' : 'lighter';
  gradientColors.forEach((color, index) => {
    const visibility = colorVisibilityWeight(color, averageLuminance, light);
    const ribbonAngle = angle + Math.PI * 0.5 + index * 0.57 + (rng() - 0.5) * 0.5;
    const offset = (index - 1.5) * shortSide * (0.12 + shapeDrift * 0.08);
    const startX =
      centerX - Math.cos(ribbonAngle) * reach * 0.45 - Math.sin(ribbonAngle) * offset;
    const startY =
      centerY - Math.sin(ribbonAngle) * reach * 0.45 + Math.cos(ribbonAngle) * offset;
    const endX =
      centerX + Math.cos(ribbonAngle) * reach * 0.45 - Math.sin(ribbonAngle) * offset;
    const endY =
      centerY + Math.sin(ribbonAngle) * reach * 0.45 + Math.cos(ribbonAngle) * offset;
    const line = ctx.createLinearGradient(startX, startY, endX, endY);
    const rgb = parseHexToRgb(color);
    line.addColorStop(0, rgbToCss(rgb, 0));
    line.addColorStop(0.36, rgbToCss(rgb, 0));
    line.addColorStop(0.5, rgbToCss(rgb, (light ? 0.036 : 0.058) * glow * strength * visibility));
    line.addColorStop(0.64, rgbToCss(rgb, 0));
    line.addColorStop(1, rgbToCss(rgb, 0));
    ctx.fillStyle = line;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  });
  ctx.restore();

  const sheen = ctx.createLinearGradient(
    centerX + dy * 0.28,
    centerY - dx * 0.28,
    centerX - dy * 0.28,
    centerY + dx * 0.28
  );
  const foreground = parseHexToRgb(light ? '#ffffff' : palette.foreground);
  sheen.addColorStop(0, rgbToCss(foreground, 0));
  sheen.addColorStop(0.48, rgbToCss(foreground, (light ? 0.04 : 0.065) * strength * glow));
  sheen.addColorStop(1, rgbToCss(foreground, 0));
  ctx.fillStyle = sheen;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  if (grain > 0) {
    const grainRgb = parseHexToRgb(light ? '#111111' : '#ffffff');
    const count = Math.round((420 + 1300 * grain) * strength * (isPreview ? 0.35 : 1));
    drawPixelGrain({
      ctx,
      rect,
      rng,
      count,
      fillStyle: rgbToCss(grainRgb, (light ? 0.018 : 0.022) * grain),
      scale,
      sizeJitter: 0.9
    });
  }
};
