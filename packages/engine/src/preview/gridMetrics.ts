type Region = {
  width: number;
  height: number;
};

export type AsciiGridMetrics = {
  columns: number;
  rows: number;
  cellHeight: number;
  cellWidth: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function computeAsciiGridMetrics(
  region: Region,
  density: number,
  sourceAspect: number,
  glyphAspect = 0.55
): AsciiGridMetrics {
  const normalizedDensity = clamp(density, 1, 18);
  const normalizedGlyphAspect = clamp(glyphAspect, 0.35, 1.2);
  const baseCharWidth = clamp(16 / Math.pow(normalizedDensity, 0.72), 1.35, 16);
  const columns = clamp(Math.round(region.width / baseCharWidth), 24, 640);
  const rows = clamp(Math.round(sourceAspect * columns * normalizedGlyphAspect), 12, 360);

  return {
    columns,
    rows,
    cellHeight: region.height / rows,
    cellWidth: region.width / columns
  };
}
