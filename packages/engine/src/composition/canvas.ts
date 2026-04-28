export type MantleCanvas = HTMLCanvasElement | OffscreenCanvas;
export type MantleCanvasRenderingContext2D =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export function createCanvas(width: number, height: number): MantleCanvas {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }

  throw new Error('Canvas rendering is not available in this environment.');
}

export function getCanvas2D(
  canvas: MantleCanvas
): MantleCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable.');
  return ctx;
}

export function resetCanvasBitmap(
  canvas: MantleCanvas,
  width = canvas.width,
  height = canvas.height
): void {
  canvas.width = width;
  canvas.height = height;
}

export function releaseScratchCanvas(canvas: MantleCanvas): void {
  resetCanvasBitmap(canvas, 1, 1);
}
