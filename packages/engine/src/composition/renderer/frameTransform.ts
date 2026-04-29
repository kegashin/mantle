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

function rotatedBounds(rect: Rect, rotation: number): Rect {
  if (rotation === 0) return rect;

  const radians = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const width = rect.width * cos + rect.height * sin;
  const height = rect.width * sin + rect.height * cos;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height
  };
}

function fitTransformedRectInsideCanvas(
  rect: Rect,
  canvas: Rect,
  rotation: number
): Rect {
  let fitted = rect;
  let bounds = rotatedBounds(fitted, rotation);
  const fitScale = Math.min(
    1,
    canvas.width / Math.max(1, bounds.width),
    canvas.height / Math.max(1, bounds.height)
  );

  if (fitScale < 1) {
    const centerX = fitted.x + fitted.width / 2;
    const centerY = fitted.y + fitted.height / 2;
    const width = fitted.width * fitScale;
    const height = fitted.height * fitScale;
    fitted = {
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height
    };
    bounds = rotatedBounds(fitted, rotation);
  }

  let shiftX = 0;
  let shiftY = 0;
  if (bounds.x < canvas.x) shiftX = canvas.x - bounds.x;
  if (bounds.x + bounds.width > canvas.x + canvas.width) {
    shiftX = canvas.x + canvas.width - (bounds.x + bounds.width);
  }
  if (bounds.y < canvas.y) shiftY = canvas.y - bounds.y;
  if (bounds.y + bounds.height > canvas.y + canvas.height) {
    shiftY = canvas.y + canvas.height - (bounds.y + bounds.height);
  }

  return {
    ...fitted,
    x: fitted.x + shiftX,
    y: fitted.y + shiftY
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

  return fitTransformedRectInsideCanvas(
    {
      x: rect.x + (rect.width - width) / 2 + resolved.x * canvas.width,
      y: rect.y + (rect.height - height) / 2 + resolved.y * canvas.height,
      width,
      height
    },
    canvas,
    resolved.rotation
  );
}
