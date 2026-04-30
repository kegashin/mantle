import type { MantleFrameTransform } from '@mantle/schemas/model';

import type { Rect } from '../types';

export const DEFAULT_FRAME_TRANSFORM: MantleFrameTransform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0
};

export function resolveFrameTransform(
  transform: MantleFrameTransform | undefined
): MantleFrameTransform {
  return {
    x: Math.max(-1, Math.min(1, transform?.x ?? DEFAULT_FRAME_TRANSFORM.x)),
    y: Math.max(-1, Math.min(1, transform?.y ?? DEFAULT_FRAME_TRANSFORM.y)),
    scaleX: Math.max(
      0.35,
      Math.min(2.5, transform?.scaleX ?? DEFAULT_FRAME_TRANSFORM.scaleX)
    ),
    scaleY: Math.max(
      0.35,
      Math.min(2.5, transform?.scaleY ?? DEFAULT_FRAME_TRANSFORM.scaleY)
    ),
    rotation: Math.max(
      -180,
      Math.min(180, transform?.rotation ?? DEFAULT_FRAME_TRANSFORM.rotation)
    )
  };
}

export function applyFrameTransformToRect({
  rect,
  canvas,
  transform
}: {
  rect: Rect;
  canvas: Rect;
  transform: MantleFrameTransform | undefined;
}): Rect {
  const resolved = resolveFrameTransform(transform);
  const width = rect.width * resolved.scaleX;
  const height = rect.height * resolved.scaleY;

  return {
    x: rect.x + (rect.width - width) / 2 + resolved.x * canvas.width,
    y: rect.y + (rect.height - height) / 2 + resolved.y * canvas.height,
    width,
    height
  };
}
