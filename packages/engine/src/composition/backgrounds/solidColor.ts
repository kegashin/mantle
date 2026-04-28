import { createRng, isLightPalette, parseHexToRgb, rgbToCss } from '../palette';
import type { BackgroundGenerator } from './types';
import { clamp01, drawPixelGrain } from './utils';

/**
 * Base fill with optional accent wash, counter highlight, and grain.
 * `intensity <= 0` leaves a true flat fill.
 */
export const solidColor: BackgroundGenerator = ({
  ctx,
  rect,
  palette,
  intensity,
  seed,
  renderMode,
  scale
}) => {
  const rng = createRng(`solid-color::${seed}`);
  const light = isLightPalette(palette);
  const preview = renderMode === 'preview';
  const strength = clamp01(intensity ?? 0.5);

  ctx.fillStyle = palette.background;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  if (strength <= 0.001) return;

  const reach = Math.hypot(rect.width, rect.height);
  const accentRgb = parseHexToRgb(palette.accent);
  const foregroundRgb = parseHexToRgb(palette.foreground);

  const washX = rect.x + rect.width * 0.32;
  const washY = rect.y + rect.height * 0.26;
  const wash = ctx.createRadialGradient(
    washX,
    washY,
    reach * 0.04,
    washX,
    washY,
    reach * 0.74
  );
  wash.addColorStop(0, rgbToCss(accentRgb, (light ? 0.04 : 0.06) * strength));
  wash.addColorStop(0.55, rgbToCss(accentRgb, (light ? 0.014 : 0.02) * strength));
  wash.addColorStop(1, rgbToCss(accentRgb, 0));
  ctx.fillStyle = wash;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const spotX = rect.x + rect.width * 0.72;
  const spotY = rect.y + rect.height * 0.78;
  const spot = ctx.createRadialGradient(
    spotX,
    spotY,
    reach * 0.03,
    spotX,
    spotY,
    reach * 0.55
  );
  spot.addColorStop(0, rgbToCss(foregroundRgb, (light ? 0.018 : 0.03) * strength));
  spot.addColorStop(1, rgbToCss(foregroundRgb, 0));
  ctx.fillStyle = spot;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const vignette = ctx.createRadialGradient(
    centerX,
    centerY,
    Math.min(rect.width, rect.height) * 0.4,
    centerX,
    centerY,
    reach * 0.78
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(
    1,
    `rgba(0, 0, 0, ${((light ? 0.08 : 0.28) * (0.5 + strength * 0.5)).toFixed(3)})`
  );
  ctx.fillStyle = vignette;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const grainCount = Math.round((preview ? 320 : 1100) * (0.4 + strength * 0.7));
  const grainRgb = parseHexToRgb(light ? '#0a0a0a' : '#ffffff');
  const grainAlpha = (light ? 0.012 : 0.018) * (0.5 + strength * 0.7);
  drawPixelGrain({
    ctx,
    rect,
    rng,
    count: grainCount,
    fillStyle: rgbToCss(grainRgb, grainAlpha),
    scale
  });
};
