import type { BackgroundGenerator } from './types';

/**
 * Solid color — intentionally plain background fill.
 */
export const solidColor: BackgroundGenerator = ({ ctx, rect, palette }) => {
  ctx.fillStyle = palette.background;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
};
