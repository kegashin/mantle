import { createRng, isLightPalette, mixHex, parseHexToRgb, rgbToCss } from '../palette';
import type { BackgroundGenerator } from './types';

type Point = {
  x: number;
  y: number;
};

/**
 * Contour lines — topographic iso-lines over a soft gradient.
 * Editorial family. Reads quiet, field-journal-like.
 */
export const contourLines: BackgroundGenerator = ({
  ctx,
  rect,
  palette,
  intensity,
  params,
  seed,
  scale
}) => {
  const rng = createRng(`contour-lines::${seed}`);
  const light = isLightPalette(palette);
  const param = (id: string, fallback: number) =>
    Math.min(1, Math.max(0, params[id] ?? fallback));
  const lineDensity = param('lineDensity', intensity);
  const relief = param('relief', 0.56);
  const reliefCurve = relief ** 0.68;
  const accentGlow = param('accentGlow', Math.min(1, intensity * 0.78));
  const accentRgb = parseHexToRgb(palette.accent);
  const strokeRgb = parseHexToRgb(
    light ? mixHex(palette.foreground, palette.background, 0.18) : palette.foreground
  );

  const base = ctx.createLinearGradient(
    rect.x,
    rect.y,
    rect.x + rect.width,
    rect.y + rect.height
  );
  base.addColorStop(0, mixHex(palette.background, palette.accent, light ? 0.05 : 0.13));
  base.addColorStop(0.58, palette.background);
  base.addColorStop(1, mixHex(palette.background, '#000000', light ? 0.04 : 0.32));
  ctx.fillStyle = base;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const aspect = rect.width / Math.max(1, rect.height);
  const phaseA = rng() * Math.PI * 2;
  const phaseB = rng() * Math.PI * 2;
  const phaseC = rng() * Math.PI * 2;
  const bumpCount = 3 + Math.round(reliefCurve * 5) + Math.round(rng() * 2);
  const bumps: Array<{ x: number; y: number; radius: number; amplitude: number }> = [];
  for (let i = 0; i < bumpCount; i += 1) {
    const valley = rng() > 0.78;
    const amplitude = (valley ? -0.42 : 0.58) * (0.16 + reliefCurve * 2.35);
    bumps.push({
      x: -0.08 + rng() * 1.16,
      y: -0.08 + rng() * 1.16,
      radius: (0.2 + rng() * 0.28) * (1.2 - reliefCurve * 0.48),
      amplitude: amplitude * (0.85 + rng() * 0.9)
    });
  }
  const terrainSharpness = 0.78 + reliefCurve * 1.35;
  const baseSlope = 0.56 - reliefCurve * 0.22;

  const field = (x: number, y: number): number => {
    const nx = (x - rect.x) / Math.max(1, rect.width);
    const ny = (y - rect.y) / Math.max(1, rect.height);
    let total = 0;
    for (const bump of bumps) {
      const dx = ((nx - bump.x) * aspect) / bump.radius;
      const dy = (ny - bump.y) / bump.radius;
      total += bump.amplitude * Math.exp(-(dx * dx + dy * dy) * terrainSharpness);
    }
    total += (0.025 + reliefCurve * 0.34) * Math.sin(nx * 10.5 + ny * 2.4 + phaseA);
    total += (0.018 + reliefCurve * 0.2) * Math.cos((nx * 2.1 - ny * 3.3) * Math.PI * 2 + phaseB);
    total += (0.008 + reliefCurve * 0.13) * Math.sin((nx + ny) * 18 + phaseC);
    total += (nx * 0.22 - ny * 0.15) * baseSlope;
    return total;
  };

  const cellSize = Math.max(7, Math.round((24 - lineDensity * 11) * scale));
  const cols = Math.max(1, Math.ceil(rect.width / cellSize));
  const rows = Math.max(1, Math.ceil(rect.height / cellSize));
  const gridWidth = cols + 1;
  const values: number[] = [];
  let minField = Number.POSITIVE_INFINITY;
  let maxField = Number.NEGATIVE_INFINITY;

  const xAt = (col: number) => rect.x + Math.min(rect.width, col * cellSize);
  const yAt = (row: number) => rect.y + Math.min(rect.height, row * cellSize);

  for (let row = 0; row <= rows; row += 1) {
    const y = yAt(row);
    for (let col = 0; col <= cols; col += 1) {
      const value = field(xAt(col), y);
      values.push(value);
      minField = Math.min(minField, value);
      maxField = Math.max(maxField, value);
    }
  }

  const valueAt = (col: number, row: number) => values[row * gridWidth + col] ?? 0;
  const span = maxField - minField;
  if (span <= 0.001) return;

  const lineCount = 10 + Math.round(lineDensity * 25);
  const levels: number[] = [];
  for (let i = 0; i < lineCount; i += 1) {
    levels.push(minField + ((i + 1) / (lineCount + 1)) * span);
  }

  const interpolate = (
    ax: number,
    ay: number,
    av: number,
    bx: number,
    by: number,
    bv: number,
    level: number
  ): Point => {
    const t = Math.min(1, Math.max(0, (level - av) / (bv - av || 1)));
    return {
      x: ax + (bx - ax) * t,
      y: ay + (by - ay) * t
    };
  };

  const pushIfCrossed = (
    points: Point[],
    ax: number,
    ay: number,
    av: number,
    bx: number,
    by: number,
    bv: number,
    level: number
  ) => {
    if ((av < level && bv >= level) || (bv < level && av >= level)) {
      points.push(interpolate(ax, ay, av, bx, by, bv, level));
    }
  };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let levelIndex = 0; levelIndex < levels.length; levelIndex += 1) {
    const level = levels[levelIndex];
    if (level == null) continue;
    const major = levelIndex % 5 === 0;
    const baseAlpha = (light ? 0.08 : 0.11) + lineDensity * (light ? 0.12 : 0.16);
    const lineWidth = Math.max(0.85, scale * (major ? 1.28 : 0.78));

    ctx.beginPath();
    for (let row = 0; row < rows; row += 1) {
      const y0 = yAt(row);
      const y1 = yAt(row + 1);
      for (let col = 0; col < cols; col += 1) {
        const x0 = xAt(col);
        const x1 = xAt(col + 1);
        const topLeft = valueAt(col, row);
        const topRight = valueAt(col + 1, row);
        const bottomRight = valueAt(col + 1, row + 1);
        const bottomLeft = valueAt(col, row + 1);
        const intersections: Point[] = [];

        pushIfCrossed(intersections, x0, y0, topLeft, x1, y0, topRight, level);
        pushIfCrossed(intersections, x1, y0, topRight, x1, y1, bottomRight, level);
        pushIfCrossed(intersections, x1, y1, bottomRight, x0, y1, bottomLeft, level);
        pushIfCrossed(intersections, x0, y1, bottomLeft, x0, y0, topLeft, level);

        if (intersections.length === 2) {
          const start = intersections[0];
          const end = intersections[1];
          if (!start || !end) continue;
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
        } else if (intersections.length === 4) {
          const first = intersections[0];
          const second = intersections[1];
          const third = intersections[2];
          const fourth = intersections[3];
          if (!first || !second || !third || !fourth) continue;
          ctx.moveTo(first.x, first.y);
          ctx.lineTo(second.x, second.y);
          ctx.moveTo(third.x, third.y);
          ctx.lineTo(fourth.x, fourth.y);
        }
      }
    }

    if (major && accentGlow > 0) {
      const glowStrength = accentGlow * accentGlow * (3 - 2 * accentGlow);
      ctx.save();
      ctx.globalCompositeOperation = light ? 'source-over' : 'screen';
      ctx.filter = `blur(${Math.max(30, scale * (80 + glowStrength * 220)).toFixed(2)}px)`;
      ctx.strokeStyle = rgbToCss(accentRgb, glowStrength * (light ? 0.1 : 0.16));
      ctx.lineWidth = lineWidth * (4.5 + glowStrength * 4.5);
      ctx.stroke();
      ctx.filter = `blur(${Math.max(16, scale * (32 + glowStrength * 88)).toFixed(2)}px)`;
      ctx.strokeStyle = rgbToCss(accentRgb, glowStrength * (light ? 0.13 : 0.2));
      ctx.lineWidth = lineWidth * (2.8 + glowStrength * 2.6);
      ctx.stroke();
      ctx.filter = `blur(${Math.max(7, scale * (12 + glowStrength * 34)).toFixed(2)}px)`;
      ctx.strokeStyle = rgbToCss(accentRgb, glowStrength * (light ? 0.12 : 0.18));
      ctx.lineWidth = lineWidth * (1.25 + glowStrength * 0.75);
      ctx.stroke();
      ctx.filter = `blur(${Math.max(3, scale * (4 + glowStrength * 12)).toFixed(2)}px)`;
      ctx.strokeStyle = rgbToCss(accentRgb, glowStrength * (light ? 0.09 : 0.14));
      ctx.lineWidth = lineWidth * (0.75 + glowStrength * 0.18);
      ctx.stroke();
      ctx.filter = 'none';
      ctx.restore();
    }

    ctx.strokeStyle = major
      ? rgbToCss(accentRgb, baseAlpha * (0.32 + accentGlow * 0.9))
      : rgbToCss(strokeRgb, baseAlpha * 0.72);
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  ctx.restore();
};
