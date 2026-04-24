const SHARPNESS_RESPONSE = 4.8;
const SHARPNESS_CURVE_EXPONENT = 0.82;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function getSharpnessFactor(sharpness: number) {
  const normalized = clamp(sharpness / 100, 0, 1);
  return Math.pow(normalized, SHARPNESS_CURVE_EXPONENT) * SHARPNESS_RESPONSE;
}

export function applySharpnessToLuminance(
  luminanceValues: number[],
  columns: number,
  rows: number,
  sharpness: number
) {
  if (sharpness <= 0) {
    return luminanceValues;
  }

  const factor = getSharpnessFactor(sharpness);
  const nextValues = luminanceValues.slice();

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const index = y * columns + x;
      const current = luminanceValues[index] ?? 0;
      const left = luminanceValues[y * columns + Math.max(0, x - 1)] ?? current;
      const right = luminanceValues[y * columns + Math.min(columns - 1, x + 1)] ?? current;
      const up = luminanceValues[Math.max(0, y - 1) * columns + x] ?? current;
      const down = luminanceValues[Math.min(rows - 1, y + 1) * columns + x] ?? current;
      const neighborAverage = (left + right + up + down) * 0.25;

      nextValues[index] = clamp(current + (current - neighborAverage) * factor, 0, 1);
    }
  }

  return nextValues;
}

export { SHARPNESS_CURVE_EXPONENT, SHARPNESS_RESPONSE };
