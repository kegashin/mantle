import { createRng, isLightPalette, parseHexToRgb, rgbToCss } from '../palette';
import type { BackgroundGenerator } from './types';
import { readBackgroundParam } from './utils';

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
  const dotOpacity = readBackgroundParam(params, 'dotOpacity', intensity, 2);
  const dotDensity = readBackgroundParam(params, 'dotDensity', 0.42);
  const dotSize = readBackgroundParam(params, 'dotSize', 0.25);

  ctx.fillStyle = palette.background;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const reach = Math.hypot(rect.width, rect.height);
  const accentRgb = parseHexToRgb(palette.accent);
  const fgRgb = parseHexToRgb(palette.foreground);

  const highlightX = rect.x + rect.width * 0.28;
  const highlightY = rect.y + rect.height * 0.18;
  const highlight = ctx.createRadialGradient(
    highlightX,
    highlightY,
    reach * 0.04,
    highlightX,
    highlightY,
    reach * 0.7
  );
  highlight.addColorStop(0, rgbToCss(accentRgb, light ? 0.06 : 0.08));
  highlight.addColorStop(0.55, rgbToCss(accentRgb, light ? 0.018 : 0.022));
  highlight.addColorStop(1, rgbToCss(accentRgb, 0));
  ctx.fillStyle = highlight;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const depth = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height);
  depth.addColorStop(0, 'rgba(0, 0, 0, 0)');
  depth.addColorStop(
    1,
    `rgba(0, 0, 0, ${light ? 0.07 : 0.22})`
  );
  ctx.fillStyle = depth;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const spacing = Math.max(12, Math.round((46 - dotDensity * 28) * scale));
  const radius = Math.max(0.65, scale * (0.65 + dotSize * 2.4));
  const baseAlpha = Math.min(
    light ? 0.58 : 0.64,
    (light ? 0.05 : 0.07) + dotOpacity * (light ? 0.22 : 0.25)
  );
  const offsetX = rng() * spacing;
  const offsetY = rng() * spacing;

  ctx.save();
  for (
    let y = rect.y - spacing + offsetY;
    y < rect.y + rect.height + spacing;
    y += spacing
  ) {
    for (
      let x = rect.x - spacing + offsetX;
      x < rect.x + rect.width + spacing;
      x += spacing
    ) {
      const dx = (x - highlightX) / reach;
      const dy = (y - highlightY) / reach;
      const distanceFromLight = Math.sqrt(dx * dx + dy * dy);
      const dotAlpha = baseAlpha * Math.max(0.55, 1 - distanceFromLight * 0.55);
      ctx.fillStyle = rgbToCss(fgRgb, dotAlpha);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
};
