const RGBA_BYTES_PER_PIXEL = 4;
export const MAX_MANTLE_RENDER_WORKING_BYTES = 512 * 1024 * 1024;

export function estimateRgbaBufferBytes(
  width: number,
  height: number,
  buffers = 1
): number {
  return Math.ceil(width) * Math.ceil(height) * RGBA_BYTES_PER_PIXEL * buffers;
}

export function formatMemoryMegabytes(bytes: number): string {
  return `${Math.ceil(bytes / (1024 * 1024))} MB`;
}

export function assertRgbaScratchBudget({
  label,
  width,
  height,
  buffers,
  limit = MAX_MANTLE_RENDER_WORKING_BYTES
}: {
  label: string;
  width: number;
  height: number;
  buffers: number;
  limit?: number;
}): void {
  const bytes = estimateRgbaBufferBytes(width, height, buffers);
  if (bytes <= limit) return;

  throw new Error(
    `${label} needs about ${formatMemoryMegabytes(bytes)} of working canvas memory. Lower export scale, shadow strength, or glass blur.`
  );
}
