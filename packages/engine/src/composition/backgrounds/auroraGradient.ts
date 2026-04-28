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
  readBackgroundParam,
  resolveProvidedBackgroundColors
} from './utils';

const TWO_PI = Math.PI * 2;

function resolveAuroraColors(
  colors: string[] | undefined,
  palette: Parameters<BackgroundGenerator>[0]['palette']
): string[] {
  const resolved = resolveProvidedBackgroundColors(colors);
  if (resolved) return resolved;

  return [
    palette.accent,
    palette.muted ?? mixHex(palette.foreground, palette.background, 0.34),
    mixHex(palette.accent, '#ffffff', 0.22),
    mixHex(palette.foreground, palette.accent, 0.36)
  ];
}

function averageColor(colors: string[]): string {
  if (colors.length === 0) return '#10131d';

  const sum = colors.reduce(
    (acc, color) => {
      const rgb = parseHexToRgb(color);
      acc.r += rgb.r;
      acc.g += rgb.g;
      acc.b += rgb.b;
      return acc;
    },
    { r: 0, g: 0, b: 0 }
  );
  const toHex = (value: number) =>
    Math.round(value / colors.length).toString(16).padStart(2, '0');

  return `#${toHex(sum.r)}${toHex(sum.g)}${toHex(sum.b)}`;
}

function colorVisibilityWeight(color: string, averageLuminance: number, light: boolean): number {
  const luminance = relativeLuminance(color);
  const ratio = light
    ? luminance / Math.max(0.02, averageLuminance)
    : averageLuminance / Math.max(0.02, luminance);
  return Math.min(1.08, Math.max(0.52, 0.72 + ratio * 0.24));
}

function addEllipticGlow({
  ctx,
  x,
  y,
  radiusX,
  radiusY,
  rotation,
  color,
  alpha,
  core = 0.08,
  fade = 0.72
}: {
  ctx: MantleCanvasRenderingContext2D;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
  color: string;
  alpha: number;
  core?: number;
  fade?: number;
}): void {
  const rgb = parseHexToRgb(color);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(Math.max(1, radiusX), Math.max(1, radiusY));

  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, rgbToCss(rgb, alpha));
  gradient.addColorStop(Math.min(0.82, core + 0.24), rgbToCss(rgb, alpha * 0.52));
  gradient.addColorStop(Math.min(0.94, fade), rgbToCss(rgb, alpha * 0.12));
  gradient.addColorStop(1, rgbToCss(rgb, 0));

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TWO_PI);
  ctx.fill();
  ctx.restore();
}

function addAuroraUnderpaint({
  ctx,
  rect,
  colors,
  light
}: {
  ctx: MantleCanvasRenderingContext2D;
  rect: Rect;
  colors: string[];
  light: boolean;
}): void {
  const base = averageColor(colors);
  ctx.fillStyle = light
    ? mixHex(base, '#ffffff', 0.34)
    : mixHex(base, '#10131d', 0.32);
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
}

function addDepthShade(
  ctx: MantleCanvasRenderingContext2D,
  rect: Rect,
  alpha: number
): void {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const reach = Math.hypot(rect.width, rect.height);
  const shade = ctx.createRadialGradient(
    centerX,
    centerY,
    Math.min(rect.width, rect.height) * 0.14,
    centerX,
    centerY,
    reach * 0.68
  );
  shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  shade.addColorStop(0.76, `rgba(0, 0, 0, ${alpha * 0.22})`);
  shade.addColorStop(1, `rgba(0, 0, 0, ${alpha})`);
  ctx.fillStyle = shade;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
}

function addAuroraGrain({
  ctx,
  rect,
  grain,
  light,
  scale,
  rng,
  preview
}: {
  ctx: MantleCanvasRenderingContext2D;
  rect: Rect;
  grain: number;
  light: boolean;
  scale: number;
  rng: () => number;
  preview: boolean;
}): void {
  if (grain <= 0) return;

  const rgb = parseHexToRgb(light ? '#111111' : '#ffffff');
  const count = Math.round((520 + grain * 1700) * (preview ? 0.34 : 1));
  ctx.save();
  ctx.fillStyle = rgbToCss(rgb, (light ? 0.018 : 0.02) * grain);
  for (let i = 0; i < count; i += 1) {
    const size = Math.max(0.55, scale * (0.45 + rng() * 0.95));
    ctx.fillRect(
      rect.x + rng() * rect.width,
      rect.y + rng() * rect.height,
      size,
      size
    );
  }
  ctx.restore();
}

export const auroraGradient: BackgroundGenerator = ({
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
  const rng = createRng(`aurora-gradient::${seed}`);
  const light = isLightPalette(palette);
  const preview = renderMode === 'preview';
  const glow = readBackgroundParam(params, 'glow', 0.62, 4);
  const spread = readBackgroundParam(params, 'spread', 0.7, 3);
  const grain = readBackgroundParam(params, 'grain', 0.06);
  const strength = clamp01(intensity || 0.78);
  const glowColors = resolveAuroraColors(colors, palette);
  const averageLuminance =
    glowColors.reduce((sum, color) => sum + relativeLuminance(color), 0) /
    glowColors.length;
  const angle = (0.12 + rng() * 0.76) * TWO_PI;
  const shortSide = Math.min(rect.width, rect.height);
  const longSide = Math.max(rect.width, rect.height);
  const anchors = [
    { x: 0.22, y: 0.3, rotation: -0.34 },
    { x: 0.78, y: 0.7, rotation: 0.48 },
    { x: 0.62, y: 0.22, rotation: -0.78 },
    { x: 0.34, y: 0.82, rotation: 0.74 },
    { x: 0.86, y: 0.38, rotation: 0.16 },
    { x: 0.16, y: 0.66, rotation: -0.58 }
  ];

  addAuroraUnderpaint({ ctx, rect, colors: glowColors, light });

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  glowColors.forEach((color, index) => {
    const anchor = anchors[index % anchors.length]!;
    const weight = colorVisibilityWeight(color, averageLuminance, light);
    const presetTurn = index * 2.399963229728653 + angle * 0.18;
    const jitterX = (rng() - 0.5) * rect.width * (0.07 + spread * 0.04);
    const jitterY = (rng() - 0.5) * rect.height * (0.07 + spread * 0.04);
    const x =
      rect.x +
      rect.width * anchor.x +
      Math.cos(presetTurn) * rect.width * 0.035 +
      jitterX;
    const y =
      rect.y +
      rect.height * anchor.y +
      Math.sin(presetTurn * 0.83) * rect.height * 0.035 +
      jitterY;
    const radiusX = longSide * (0.28 + spread * 0.3);
    const radiusY = shortSide * (0.23 + spread * 0.25);
    const rotation = angle * 0.2 + anchor.rotation + (rng() - 0.5) * 0.34;
    const alpha = (light ? 0.16 : 0.26) * strength * (0.54 + glow * 0.52) * weight;

    addEllipticGlow({
      ctx,
      x,
      y,
      radiusX,
      radiusY,
      rotation,
      color,
      alpha,
      core: 0.08 + spread * 0.05,
      fade: 0.58 + spread * 0.24
    });

    if (!preview || index < 3) {
      addEllipticGlow({
        ctx,
        x: x + Math.cos(rotation + 0.9) * radiusX * 0.16,
        y: y + Math.sin(rotation + 0.9) * radiusY * 0.14,
        radiusX: radiusX * 0.46,
        radiusY: radiusY * 0.42,
        rotation: rotation - 0.72,
        color,
        alpha: alpha * 0.4,
        core: 0.04,
        fade: 0.72
      });
    }
  });

  ctx.restore();

  addDepthShade(ctx, rect, light ? 0.05 + glow * 0.015 : 0.03 + glow * 0.03);
  addAuroraGrain({ ctx, rect, grain, light, scale, rng, preview });
};
