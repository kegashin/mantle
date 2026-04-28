import type { MantleCanvasRenderingContext2D } from '../canvas';
import type { Rect } from '../types';

export function drawRoundRectPath(
  ctx: MantleCanvasRenderingContext2D,
  { x, y, width, height }: Rect,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export function drawBottomRoundRectPath(
  ctx: MantleCanvasRenderingContext2D,
  { x, y, width, height }: Rect,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y);
  ctx.closePath();
}
