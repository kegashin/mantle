import { createRng, isLightPalette, mixHex, parseHexToRgb, rgbToCss } from '../palette';
import type { BackgroundGenerator } from './types';

/**
 * Dot grid — extremely quiet, evenly-spaced dots. Docs/notebook aesthetic.
 * Minimal variation; leans on palette for mood.
 */
export const dotGrid: BackgroundGenerator = ({
  ctx,
  rect,
  palette,
  intensity,
  params,
  seed,
  scale
}) => {
  const rng = createRng(`dot-grid::${seed}`);
  const light = isLightPalette(palette);
  const param = (id: string, fallback: number) =>
    Math.min(1, Math.max(0, params[id] ?? fallback));
  const dotOpacity = param('dotOpacity', intensity);
  const dotDensity = param('dotDensity', 0.42);

  // Base.
  const base = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height);
  base.addColorStop(0, palette.background);
  base.addColorStop(1, mixHex(palette.background, '#000000', light ? 0.03 : 0.15));
  ctx.fillStyle = base;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  // Dots.
  const spacing = Math.max(12, Math.round((46 - dotDensity * 28) * scale));
  const radius = Math.max(0.9, scale * 1.25);
  const dotRgb = parseHexToRgb(light ? palette.foreground : palette.foreground);
  const baseAlpha = (light ? 0.05 : 0.07) + dotOpacity * (light ? 0.22 : 0.25);
  const offsetX = rng() * spacing;
  const offsetY = rng() * spacing;

  ctx.save();
  ctx.fillStyle = rgbToCss(dotRgb, baseAlpha);
  for (let y = rect.y - spacing + offsetY; y < rect.y + rect.height + spacing; y += spacing) {
    for (let x = rect.x - spacing + offsetX; x < rect.x + rect.width + spacing; x += spacing) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
};
