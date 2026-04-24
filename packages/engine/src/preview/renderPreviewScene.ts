import type { ConversionSettings, PreviewState } from '@glyphrame/schemas';

import { computeAsciiGridMetrics } from './gridMetrics';
import {
  findBlankGlyphIndex,
  getGlyphCharacters,
  shouldUseBlankGlyph
} from './glyphSelection';
import {
  applySharpnessToLuminance,
  getSharpnessFactor
} from './sharpness';
import type { EngineSessionState, PreviewSourceImage } from '../runtime/sessionState';

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PreviewRenderResult = {
  textLines: string[];
  columns: number;
  rows: number;
};

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
] as const;

const CHARSET_PRESETS: Record<string, string> = {
  classic: '@%#*+=-:. ',
  blocks: '█▓▒░ ',
  minimal: '#*:.',
  dense: '@$B%8&WM#*oahkbdpqwmZO0QLCJYXzcvunxrjft/\\|()1{}[]?-_+~i!lI;:,`^. '
};

type SampleFrame = {
  colors: string[][];
  columns: number;
  rows: number;
  textLines: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getGlyphSet(settings: ConversionSettings) {
  if (settings.customCharset && settings.customCharset.trim().length >= 2) {
    return settings.customCharset;
  }

  return CHARSET_PRESETS[settings.charsetPreset] ?? '@%#*+=-:. ';
}

function adjustNormalized(value: number, settings: ConversionSettings) {
  let next = value;
  next += settings.brightness / 100;
  next = (next - 0.5) * (1 + settings.contrast / 100) + 0.5;
  next = Math.pow(clamp(next, 0, 1), settings.gamma);

  if (settings.invert) {
    next = 1 - next;
  }

  return clamp(next, 0, 1);
}

function adjustChannel(value: number, settings: ConversionSettings) {
  return Math.round(adjustNormalized(value / 255, settings) * 255);
}

function applyOriginalPreviewAdjustments(
  imageData: ImageData,
  settings: ConversionSettings
) {
  const { data, width, height } = imageData;
  const adjusted = new Uint8ClampedArray(data.length);

  for (let offset = 0; offset < data.length; offset += 4) {
    adjusted[offset] = adjustChannel(data[offset] ?? 0, settings);
    adjusted[offset + 1] = adjustChannel(data[offset + 1] ?? 0, settings);
    adjusted[offset + 2] = adjustChannel(data[offset + 2] ?? 0, settings);
    adjusted[offset + 3] = data[offset + 3] ?? 255;
  }

  if (settings.sharpness <= 0) {
    return new ImageData(adjusted, width, height);
  }

  const factor = getSharpnessFactor(settings.sharpness);
  const sharpened = new Uint8ClampedArray(adjusted);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;

      for (let channel = 0; channel < 3; channel += 1) {
        const current = adjusted[index + channel] ?? 0;
        const left =
          adjusted[(y * width + Math.max(0, x - 1)) * 4 + channel] ?? current;
        const right =
          adjusted[(y * width + Math.min(width - 1, x + 1)) * 4 + channel] ?? current;
        const up =
          adjusted[(Math.max(0, y - 1) * width + x) * 4 + channel] ?? current;
        const down =
          adjusted[(Math.min(height - 1, y + 1) * width + x) * 4 + channel] ?? current;
        const neighborAverage = (left + right + up + down) * 0.25;

        sharpened[index + channel] = Math.max(
          0,
          Math.min(255, Math.round(current + (current - neighborAverage) * factor))
        );
      }
    }
  }

  return new ImageData(sharpened, width, height);
}

function computeLuminance(red: number, green: number, blue: number) {
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

function fitRectInto(bounds: Rect, sourceWidth: number, sourceHeight: number): Rect {
  const sourceAspect = sourceWidth / Math.max(1, sourceHeight);
  const boundsAspect = bounds.width / Math.max(1, bounds.height);

  if (sourceAspect > boundsAspect) {
    const height = bounds.width / sourceAspect;
    return {
      x: bounds.x,
      y: bounds.y + (bounds.height - height) / 2,
      width: bounds.width,
      height
    };
  }

  const width = bounds.height * sourceAspect;

  return {
    x: bounds.x + (bounds.width - width) / 2,
    y: bounds.y,
    width,
    height: bounds.height
  };
}

function getSourceDimensions(source: PreviewSourceImage) {
  if ('naturalWidth' in source) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height
    };
  }

  return {
    width: source.width,
    height: source.height
  };
}

function buildLuminanceArray(
  imageData: ImageData,
  settings: ConversionSettings,
  columns: number,
  rows: number
) {
  let luminanceValues = new Array<number>(columns * rows);
  const colors = new Array<{ red: number; green: number; blue: number }>(columns * rows);
  const source = imageData.data;

  for (let index = 0; index < columns * rows; index += 1) {
    const offset = index * 4;
    const red = source[offset] ?? 0;
    const green = source[offset + 1] ?? 0;
    const blue = source[offset + 2] ?? 0;

    colors[index] = {
      red,
      green,
      blue
    };
    luminanceValues[index] = adjustNormalized(
      computeLuminance(red, green, blue),
      settings
    );
  }

  luminanceValues = applySharpnessToLuminance(
    luminanceValues,
    columns,
    rows,
    settings.sharpness
  );

  if (settings.detailBoost > 0) {
    const boost = settings.detailBoost / 100;
    const nextValues = luminanceValues.slice();

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const index = y * columns + x;
        const current = luminanceValues[index] ?? 0;
        const right = luminanceValues[y * columns + Math.min(columns - 1, x + 1)] ?? current;
        const down =
          luminanceValues[Math.min(rows - 1, y + 1) * columns + x] ?? current;
        const edge = (Math.abs(current - right) + Math.abs(current - down)) * 0.5;

        nextValues[index] = clamp(current + edge * boost * 1.2, 0, 1);
      }
    }

    return {
      luminanceValues: nextValues,
      colors
    };
  }

  return {
    luminanceValues,
    colors
  };
}

function quantizeOrdered(
  luminanceValues: number[],
  columns: number,
  rows: number,
  levels: number,
  intensity: number
) {
  const values = new Array<number>(luminanceValues.length);
  const normalizedIntensity = clamp(intensity, 0, 4);

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const index = y * columns + x;
      const threshold = BAYER_4X4[y % 4]?.[x % 4] ?? 0;
      const bias = ((threshold / 15 - 0.5) / Math.max(1, levels)) * normalizedIntensity;
      values[index] = clamp((luminanceValues[index] ?? 0) + bias, 0, 1);
    }
  }

  return values;
}

function quantizeFloydSteinberg(
  luminanceValues: number[],
  columns: number,
  rows: number,
  levels: number,
  intensity: number
) {
  const values = luminanceValues.slice();
  const output = new Array<number>(values.length);
  const normalizedIntensity = clamp(intensity, 0, 4);

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const index = y * columns + x;
      const oldValue = values[index] ?? 0;
      const quantizedIndex = clamp(Math.round(oldValue * levels), 0, levels);
      const newValue = quantizedIndex / Math.max(1, levels);
      const error = oldValue - newValue;

      output[index] = newValue;

      if (x + 1 < columns) {
        values[index + 1] = clamp(
          (values[index + 1] ?? 0) + error * (7 / 16) * normalizedIntensity,
          0,
          1
        );
      }
      if (y + 1 < rows && x > 0) {
        values[index + columns - 1] = clamp(
          (values[index + columns - 1] ?? 0) + error * (3 / 16) * normalizedIntensity,
          0,
          1
        );
      }
      if (y + 1 < rows) {
        values[index + columns] = clamp(
          (values[index + columns] ?? 0) + error * (5 / 16) * normalizedIntensity,
          0,
          1
        );
      }
      if (y + 1 < rows && x + 1 < columns) {
        values[index + columns + 1] = clamp(
          (values[index + columns + 1] ?? 0) + error * (1 / 16) * normalizedIntensity,
          0,
          1
        );
      }
    }
  }

  return output;
}

function pickQuantizedValues(
  luminanceValues: number[],
  settings: ConversionSettings,
  columns: number,
  rows: number,
  levels: number
) {
  if (settings.dithering === 'ordered') {
    return quantizeOrdered(
      luminanceValues,
      columns,
      rows,
      levels,
      settings.ditherIntensity
    );
  }

  if (settings.dithering === 'floyd-steinberg') {
    return quantizeFloydSteinberg(
      luminanceValues,
      columns,
      rows,
      levels,
      settings.ditherIntensity
    );
  }

  return luminanceValues;
}

function measureLocalEdge(
  luminanceValues: number[],
  columns: number,
  rows: number,
  x: number,
  y: number
) {
  const index = y * columns + x;
  const current = luminanceValues[index] ?? 0;
  const left = luminanceValues[y * columns + Math.max(0, x - 1)] ?? current;
  const right = luminanceValues[y * columns + Math.min(columns - 1, x + 1)] ?? current;
  const up = luminanceValues[Math.max(0, y - 1) * columns + x] ?? current;
  const down = luminanceValues[Math.min(rows - 1, y + 1) * columns + x] ?? current;

  return (
    (Math.abs(current - left) +
      Math.abs(current - right) +
      Math.abs(current - up) +
      Math.abs(current - down)) /
    4
  );
}

function sampleSourceFrame(
  state: EngineSessionState,
  region: Rect
): SampleFrame {
  const sourceBitmap = state.sourceBitmap;

  if (!state.source || !sourceBitmap) {
    return {
      colors: [],
      columns: 0,
      rows: 0,
      textLines: []
    };
  }

  const grid = computeAsciiGridMetrics(
    region,
    state.conversionSettings.density,
    state.source.height / Math.max(1, state.source.width),
    state.conversionSettings.glyphAspect
  );
  const columns = grid.columns;
  const rows = grid.rows;
  const sampleCanvas = createCanvas(columns, rows);
  const sampleContext = sampleCanvas.getContext('2d');

  if (!sampleContext) {
    return {
      colors: [],
      columns: 0,
      rows: 0,
      textLines: []
    };
  }

  sampleContext.imageSmoothingEnabled = true;
  sampleContext.imageSmoothingQuality = 'high';
  sampleContext.clearRect(0, 0, columns, rows);
  sampleContext.drawImage(sourceBitmap, 0, 0, columns, rows);

  const imageData = sampleContext.getImageData(0, 0, columns, rows);
  const glyphSet = getGlyphSet(state.conversionSettings);
  const glyphs = getGlyphCharacters(glyphSet);
  const levels = Math.max(1, glyphs.length - 1);
  const blankGlyphIndex = findBlankGlyphIndex(glyphSet);
  const { luminanceValues, colors } = buildLuminanceArray(
    imageData,
    state.conversionSettings,
    columns,
    rows
  );
  const quantizedValues = pickQuantizedValues(
    luminanceValues,
    state.conversionSettings,
    columns,
    rows,
    levels
  );

  const textLines: string[] = [];
  const colorLines: string[][] = [];

  for (let y = 0; y < rows; y += 1) {
    let line = '';
    const colorLine: string[] = [];

    for (let x = 0; x < columns; x += 1) {
      const index = y * columns + x;
      const normalized = clamp(quantizedValues[index] ?? 0, 0, 1);
      const localEdge = measureLocalEdge(luminanceValues, columns, rows, x, y);
      const glyphIndex = shouldUseBlankGlyph(normalized, localEdge, blankGlyphIndex)
        ? blankGlyphIndex
        : clamp(Math.round(normalized * levels), 0, levels);
      const glyph = glyphs[glyphIndex] ?? ' ';
      const color = colors[index] ?? { red: 255, green: 255, blue: 255 };

      line += glyph;

      if (state.conversionSettings.colorMode === 'monochrome') {
        colorLine.push(
          state.conversionSettings.foregroundColor ?? '#f4f4f5'
        );
      } else {
        colorLine.push(
          `rgb(${adjustChannel(color.red, state.conversionSettings)} ${adjustChannel(
            color.green,
            state.conversionSettings
          )} ${adjustChannel(color.blue, state.conversionSettings)})`
        );
      }
    }

    textLines.push(line);
    colorLines.push(colorLine);
  }

  return {
    colors: colorLines,
    columns,
    rows,
    textLines
  };
}

function drawOriginalRegion(
  context: CanvasRenderingContext2D,
  bitmap: PreviewSourceImage,
  bounds: Rect,
  settings: ConversionSettings
) {
  const { width, height } = getSourceDimensions(bitmap);
  const fitted = fitRectInto(bounds, width, height);
  const renderWidth = Math.max(1, Math.round(fitted.width));
  const renderHeight = Math.max(1, Math.round(fitted.height));
  const previewCanvas = createCanvas(renderWidth, renderHeight);
  const previewContext = previewCanvas.getContext('2d');

  if (!previewContext) {
    throw new Error('Original preview canvas 2D context is unavailable.');
  }

  previewContext.imageSmoothingEnabled = true;
  previewContext.imageSmoothingQuality = 'high';
  previewContext.clearRect(0, 0, renderWidth, renderHeight);
  previewContext.drawImage(bitmap, 0, 0, renderWidth, renderHeight);

  const imageData = previewContext.getImageData(0, 0, renderWidth, renderHeight);
  const adjustedImageData = applyOriginalPreviewAdjustments(imageData, settings);
  previewContext.putImageData(adjustedImageData, 0, 0);

  context.save();
  context.beginPath();
  context.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 20);
  context.clip();
  context.fillStyle = 'rgba(255, 255, 255, 0.02)';
  context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.drawImage(previewCanvas, fitted.x, fitted.y, fitted.width, fitted.height);
  context.restore();
}

function drawAsciiRegion(
  context: CanvasRenderingContext2D,
  region: Rect,
  frame: SampleFrame,
  settings: ConversionSettings
) {
  context.save();
  context.beginPath();
  context.roundRect(region.x, region.y, region.width, region.height, 20);
  context.clip();
  context.fillStyle = settings.backgroundColor;
  context.fillRect(region.x, region.y, region.width, region.height);

  if (frame.columns === 0 || frame.rows === 0) {
    context.restore();
    return;
  }

  const cellWidth = region.width / frame.columns;
  const cellHeight = region.height / frame.rows;
  const fontSize = clamp(Math.min(cellHeight * 0.86, cellWidth * 1.7), 2.5, 28);

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `${Math.floor(fontSize)}px "IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace`;

  for (let y = 0; y < frame.rows; y += 1) {
    const line = frame.textLines[y] ?? '';
    const colors = frame.colors[y] ?? [];

    for (let x = 0; x < frame.columns; x += 1) {
      const glyph = line[x] ?? ' ';
      if (glyph === ' ') {
        continue;
      }
      const glyphColor = colors[x] ?? '#f4f4f5';
      const centerX = region.x + x * cellWidth + cellWidth / 2;
      const centerY = region.y + y * cellHeight + cellHeight / 2;

      context.fillStyle = glyphColor;
      context.fillText(glyph, centerX, centerY);
    }
  }

  context.restore();
}

function drawScaffoldEmptyState(
  context: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#141416');
  gradient.addColorStop(0.5, '#0f0f11');
  gradient.addColorStop(1, '#0a0a0c');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.save();
  context.strokeStyle = 'rgba(148, 163, 184, 0.12)';
  context.lineWidth = 1;
  for (let x = 0; x <= width; x += 24) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y <= height; y += 24) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  context.restore();

  context.fillStyle = '#f4f4f5';
  context.font = '600 18px "IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace';
  context.fillText('ASCII LAB', 32, 44);

  context.fillStyle = 'rgba(244, 244, 245, 0.72)';
  context.font = '14px "IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace';
  [
    'Load a PNG, JPEG, WebP or GIF to start the first static converter path.',
    'The current milestone renders real ASCII from the selected source image.',
    'The final WebGPU backend still lands in a later pass.'
  ].forEach((line, index) => {
    context.fillText(line, 32, 92 + index * 26);
  });
}

function drawPreviewHeader(
  context: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number
) {
  context.save();
  context.fillStyle = 'rgba(226, 232, 240, 0.92)';
  context.font = '600 11px "IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace';
  context.fillText(label, x, y);
  context.restore();
}

function getCanvasSize(target: HTMLCanvasElement, width?: number, height?: number) {
  const rect = target.getBoundingClientRect();

  return {
    width: width ?? Math.max(320, Math.floor(rect.width || target.width || 960)),
    height: height ?? Math.max(240, Math.floor(rect.height || target.height || 640))
  };
}

function renderOriginalOnly(
  context: CanvasRenderingContext2D,
  state: EngineSessionState,
  width: number,
  height: number
) {
  const bitmap = state.sourceBitmap;

  if (!bitmap) {
    drawScaffoldEmptyState(context, width, height);
    return {
      textLines: [],
      columns: 0,
      rows: 0
    };
  }

  const bounds = {
    x: 24,
    y: 42,
    width: width - 48,
    height: height - 66
  };

  context.fillStyle = '#0a0a0c';
  context.fillRect(0, 0, width, height);
  drawPreviewHeader(context, 'ORIGINAL', bounds.x, 24);
  drawOriginalRegion(context, bitmap, bounds, state.conversionSettings);

  return {
    textLines: [],
    columns: 0,
    rows: 0
  };
}

function renderFinalOnly(
  context: CanvasRenderingContext2D,
  state: EngineSessionState,
  width: number,
  height: number,
  sceneBackground: string,
  frameStyle: 'preview' | 'export'
) {
  if (!state.sourceBitmap || !state.source) {
    drawScaffoldEmptyState(context, width, height);
    return {
      textLines: [],
      columns: 0,
      rows: 0
    };
  }

  const bounds =
    frameStyle === 'export'
      ? {
          x: 0,
          y: 0,
          width,
          height
        }
      : {
          x: 24,
          y: 42,
          width: width - 48,
          height: height - 66
        };
  const fitted = fitRectInto(bounds, state.source.width, state.source.height);
  const frame = sampleSourceFrame(state, fitted);

  context.fillStyle = sceneBackground;
  context.fillRect(0, 0, width, height);

  if (frameStyle === 'preview') {
    drawPreviewHeader(context, 'ASCII', fitted.x, 24);
  }

  drawAsciiRegion(context, fitted, frame, state.conversionSettings);

  return {
    textLines: frame.textLines,
    columns: frame.columns,
    rows: frame.rows
  };
}

function renderSplitView(
  context: CanvasRenderingContext2D,
  state: EngineSessionState,
  width: number,
  height: number
) {
  if (!state.sourceBitmap || !state.source) {
    drawScaffoldEmptyState(context, width, height);
    return {
      textLines: [],
      columns: 0,
      rows: 0
    };
  }

  const gap = 14;
  const halfWidth = (width - 48 - gap) / 2;
  const leftBounds = {
    x: 24,
    y: 42,
    width: halfWidth,
    height: height - 66
  };
  const rightBounds = {
    x: 24 + halfWidth + gap,
    y: 42,
    width: halfWidth,
    height: height - 66
  };
  const leftFitted = fitRectInto(leftBounds, state.source.width, state.source.height);
  const rightFitted = fitRectInto(rightBounds, state.source.width, state.source.height);
  const frame = sampleSourceFrame(state, rightFitted);

  context.fillStyle = '#0a0a0c';
  context.fillRect(0, 0, width, height);
  drawPreviewHeader(context, 'ORIGINAL', leftBounds.x, 24);
  drawPreviewHeader(context, 'ASCII', rightBounds.x, 24);
  drawOriginalRegion(context, state.sourceBitmap, leftFitted, state.conversionSettings);
  drawAsciiRegion(context, rightFitted, frame, state.conversionSettings);

  context.save();
  context.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  context.setLineDash([6, 6]);
  context.beginPath();
  context.moveTo(width / 2, 48);
  context.lineTo(width / 2, height - 24);
  context.stroke();
  context.restore();

  return {
    textLines: frame.textLines,
    columns: frame.columns,
    rows: frame.rows
  };
}

export function renderPreviewScene(
  target: HTMLCanvasElement,
  state: EngineSessionState,
  options?: {
    frameStyle?: 'preview' | 'export';
    height?: number;
    mode?: PreviewState['mode'];
    sceneBackground?: string;
    width?: number;
  }
): PreviewRenderResult {
  const size = getCanvasSize(target, options?.width, options?.height);
  target.width = size.width;
  target.height = size.height;

  const context = target.getContext('2d');

  if (!context) {
    throw new Error('Preview canvas 2D context is unavailable.');
  }

  context.clearRect(0, 0, size.width, size.height);

  const mode = options?.mode ?? state.previewState.mode;
  const frameStyle = options?.frameStyle ?? 'preview';
  const sceneBackground = options?.sceneBackground ?? '#0a0a0c';

  if (mode === 'original') {
    return renderOriginalOnly(context, state, size.width, size.height);
  }

  if (mode === 'final') {
    return renderFinalOnly(
      context,
      state,
      size.width,
      size.height,
      sceneBackground,
      frameStyle
    );
  }

  return renderSplitView(context, state, size.width, size.height);
}
