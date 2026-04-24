import type { ConversionSettings, PreviewMode } from '@glyphrame/schemas';

import { computeAsciiGridMetrics } from '../preview/gridMetrics';
import {
  BLANK_GLYPH_EDGE_THRESHOLD,
  BLANK_GLYPH_LUMINANCE_THRESHOLD,
  findBlankGlyphIndex
} from '../preview/glyphSelection';
import {
  SHARPNESS_CURVE_EXPONENT,
  SHARPNESS_RESPONSE
} from '../preview/sharpness';
import type { EngineSessionState, PreviewSourceImage } from '../runtime/sessionState';

const DEFAULT_CHARSET = '@%#*+=-:. ';

const SHADER_CODE = /* wgsl */ `
const BLANK_GLYPH_LUMINANCE_THRESHOLD: f32 = ${BLANK_GLYPH_LUMINANCE_THRESHOLD};
const BLANK_GLYPH_EDGE_THRESHOLD: f32 = ${BLANK_GLYPH_EDGE_THRESHOLD};
const SHARPNESS_RESPONSE: f32 = ${SHARPNESS_RESPONSE};
const SHARPNESS_CURVE_EXPONENT: f32 = ${SHARPNESS_CURVE_EXPONENT};

struct Uniforms {
  canvasSize: vec2f,
  sourceSize: vec2f,
  originalMin: vec2f,
  originalSize: vec2f,
  asciiMin: vec2f,
  asciiSize: vec2f,
  grid: vec4f,
  adjustments: vec4f,
  options: vec4f,
  backgroundColor: vec4f,
  foregroundColor: vec4f,
  atlasMeta: vec4f,
  tuning: vec4f,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var sourceTexture: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;
@group(0) @binding(3) var atlasTexture: texture_2d<f32>;
@group(0) @binding(4) var atlasSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
};

fn clamp01(value: f32) -> f32 {
  return clamp(value, 0.0, 1.0);
}

fn contains(point: vec2f, origin: vec2f, size: vec2f) -> bool {
  return point.x >= origin.x &&
    point.y >= origin.y &&
    point.x <= origin.x + size.x &&
    point.y <= origin.y + size.y;
}

fn adjustNormalized(value: f32) -> f32 {
  var next = value + u.adjustments.x;
  next = (next - 0.5) * (1.0 + u.adjustments.y) + 0.5;
  next = pow(clamp01(next), max(u.adjustments.z, 0.0001));

  if (u.adjustments.w > 0.5) {
    next = 1.0 - next;
  }

  return clamp01(next);
}

fn luminance(color: vec3f) -> f32 {
  return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}

fn bayerThreshold(coord: vec2u) -> f32 {
  let x = coord.x & 3u;
  let y = coord.y & 3u;

  if (y == 0u) {
    if (x == 0u) { return 0.0; }
    if (x == 1u) { return 8.0; }
    if (x == 2u) { return 2.0; }
    return 10.0;
  }

  if (y == 1u) {
    if (x == 0u) { return 12.0; }
    if (x == 1u) { return 4.0; }
    if (x == 2u) { return 14.0; }
    return 6.0;
  }

  if (y == 2u) {
    if (x == 0u) { return 3.0; }
    if (x == 1u) { return 11.0; }
    if (x == 2u) { return 1.0; }
    return 9.0;
  }

  if (x == 0u) { return 15.0; }
  if (x == 1u) { return 7.0; }
  if (x == 2u) { return 13.0; }
  return 5.0;
}

fn placeholderBackground(point: vec2f) -> vec4f {
  let uv = point / max(u.canvasSize, vec2f(1.0, 1.0));
  // Neutral grayscale gradient — equal RGB channels, no blue tint.
  let top = vec3f(0.082, 0.082, 0.086);
  let middle = vec3f(0.058, 0.058, 0.062);
  let bottom = vec3f(0.031, 0.031, 0.035);
  let gradient = mix(mix(top, middle, uv.y), bottom, uv.y * uv.y);
  let gridMaskX = step(0.985, fract(point.x / 24.0));
  let gridMaskY = step(0.985, fract(point.y / 24.0));
  let grid = max(gridMaskX, gridMaskY) * 0.06;
  return vec4f(gradient + grid, 1.0);
}

fn sampleOriginal(point: vec2f) -> vec4f {
  if (!contains(point, u.originalMin, u.originalSize)) {
    return placeholderBackground(point);
  }

  let uv = (point - u.originalMin) / u.originalSize;
  let texel = 1.0 / max(u.sourceSize, vec2f(1.0, 1.0));
  let sharpness = pow(clamp(u.tuning.x, 0.0, 1.0), SHARPNESS_CURVE_EXPONENT) * SHARPNESS_RESPONSE;
  let center = textureSampleLevel(sourceTexture, sourceSampler, uv, 0.0).rgb;
  let left = textureSampleLevel(
    sourceTexture,
    sourceSampler,
    clamp(uv - vec2f(texel.x, 0.0), vec2f(0.0), vec2f(1.0)),
    0.0
  ).rgb;
  let right = textureSampleLevel(
    sourceTexture,
    sourceSampler,
    clamp(uv + vec2f(texel.x, 0.0), vec2f(0.0), vec2f(1.0)),
    0.0
  ).rgb;
  let up = textureSampleLevel(
    sourceTexture,
    sourceSampler,
    clamp(uv - vec2f(0.0, texel.y), vec2f(0.0), vec2f(1.0)),
    0.0
  ).rgb;
  let down = textureSampleLevel(
    sourceTexture,
    sourceSampler,
    clamp(uv + vec2f(0.0, texel.y), vec2f(0.0), vec2f(1.0)),
    0.0
  ).rgb;

  let centerAdjusted = vec3f(
    adjustNormalized(center.r),
    adjustNormalized(center.g),
    adjustNormalized(center.b)
  );
  let neighborAdjusted = (
    vec3f(
      adjustNormalized(left.r),
      adjustNormalized(left.g),
      adjustNormalized(left.b)
    ) +
    vec3f(
      adjustNormalized(right.r),
      adjustNormalized(right.g),
      adjustNormalized(right.b)
    ) +
    vec3f(
      adjustNormalized(up.r),
      adjustNormalized(up.g),
      adjustNormalized(up.b)
    ) +
    vec3f(
      adjustNormalized(down.r),
      adjustNormalized(down.g),
      adjustNormalized(down.b)
    )
  ) * 0.25;

  let sharpened = clamp(
    centerAdjusted + (centerAdjusted - neighborAdjusted) * sharpness,
    vec3f(0.0),
    vec3f(1.0)
  );

  return vec4f(sharpened, 1.0);
}

fn adjustedColor(sampleUv: vec2f) -> vec3f {
  let sourceColor = textureSampleLevel(sourceTexture, sourceSampler, sampleUv, 0.0).rgb;
  return vec3f(
    adjustNormalized(sourceColor.r),
    adjustNormalized(sourceColor.g),
    adjustNormalized(sourceColor.b)
  );
}

fn asciiColor(point: vec2f) -> vec4f {
  if (!contains(point, u.asciiMin, u.asciiSize)) {
    return vec4f(u.backgroundColor.rgb, 1.0);
  }

  let local = (point - u.asciiMin) / u.asciiSize;
  let gridSize = max(u.grid.xy, vec2f(1.0, 1.0));
  let cell = min(vec2u(floor(local * gridSize)), vec2u(gridSize - vec2f(1.0, 1.0)));
  let cellCenterUv = (vec2f(cell) + vec2f(0.5, 0.5)) / gridSize;
  let texel = 1.0 / max(u.sourceSize, vec2f(1.0, 1.0));
  let sharpness = pow(clamp(u.tuning.x, 0.0, 1.0), SHARPNESS_CURVE_EXPONENT) * SHARPNESS_RESPONSE;
  let centerColor = textureSampleLevel(sourceTexture, sourceSampler, cellCenterUv, 0.0).rgb;
  let centerLuminance = adjustNormalized(luminance(centerColor));
  let left = adjustNormalized(
    luminance(textureSampleLevel(sourceTexture, sourceSampler, clamp(cellCenterUv - vec2f(texel.x, 0.0), vec2f(0.0), vec2f(1.0)), 0.0).rgb)
  );
  let right = adjustNormalized(
    luminance(textureSampleLevel(sourceTexture, sourceSampler, clamp(cellCenterUv + vec2f(texel.x, 0.0), vec2f(0.0), vec2f(1.0)), 0.0).rgb)
  );
  let up = adjustNormalized(
    luminance(textureSampleLevel(sourceTexture, sourceSampler, clamp(cellCenterUv - vec2f(0.0, texel.y), vec2f(0.0), vec2f(1.0)), 0.0).rgb)
  );
  let down = adjustNormalized(
    luminance(textureSampleLevel(sourceTexture, sourceSampler, clamp(cellCenterUv + vec2f(0.0, texel.y), vec2f(0.0), vec2f(1.0)), 0.0).rgb)
  );
  let neighborAverage = (left + right + up + down) * 0.25;
  var baseLuminance = clamp01(
    centerLuminance + (centerLuminance - neighborAverage) * sharpness
  );
  let localEdge = (
    abs(baseLuminance - left) +
    abs(baseLuminance - right) +
    abs(baseLuminance - up) +
    abs(baseLuminance - down)
  ) * 0.25;
  let detailBoost = clamp(u.options.x, 0.0, 1.0);

  if (detailBoost > 0.0) {
    baseLuminance = clamp01(baseLuminance + localEdge * detailBoost * 1.2);
  }

  let luminanceForBlank = baseLuminance;

  let glyphLevels = max(u.atlasMeta.x - 1.0, 1.0);
  if (u.options.w >= 1.0) {
    let bias = ((bayerThreshold(cell) / 15.0 - 0.5) / glyphLevels) * clamp(u.tuning.y, 0.0, 4.0);
    baseLuminance = clamp01(baseLuminance + bias);
  }

  var glyphIndex = clamp(round(baseLuminance * glyphLevels), 0.0, glyphLevels);
  if (
    u.backgroundColor.a > 0.5 &&
    luminanceForBlank >= BLANK_GLYPH_LUMINANCE_THRESHOLD &&
    localEdge <= BLANK_GLYPH_EDGE_THRESHOLD
  ) {
    glyphIndex = u.foregroundColor.a;
  }
  let glyphsPerRow = max(u.atlasMeta.y, 1.0);
  let atlasCellSize = max(u.atlasMeta.z, 1.0);
  let glyphColumn = glyphIndex % glyphsPerRow;
  let glyphRow = floor(glyphIndex / glyphsPerRow);
  let cellLocal = fract(local * gridSize);
  let atlasSize = vec2f(textureDimensions(atlasTexture));
  let atlasPixel =
    vec2f(glyphColumn * atlasCellSize, glyphRow * atlasCellSize) +
    cellLocal * atlasCellSize;
  let atlasUv = atlasPixel / atlasSize;
  let glyphMask = textureSampleLevel(atlasTexture, atlasSampler, atlasUv, 0.0).a;
  let mask = smoothstep(0.15, 0.65, glyphMask);

  let color = select(
    adjustedColor(cellCenterUv),
    u.foregroundColor.rgb,
    u.options.y > 0.5
  );

  return vec4f(mix(u.backgroundColor.rgb, color, mask), 1.0);
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );

  var output: VertexOutput;
  output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
  return output;
}

@fragment
fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let point = position.xy;

  if (u.atlasMeta.w < 0.5) {
    return placeholderBackground(point);
  }

  let mode = i32(u.options.z);

  if (mode == 0) {
    return sampleOriginal(point);
  }

  if (mode == 1) {
    return asciiColor(point);
  }

  let splitX = u.canvasSize.x * 0.5;
  if (point.x <= splitX) {
    return sampleOriginal(point);
  }

  return asciiColor(point);
}
`;

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type AtlasState = {
  cellSize: number;
  glyphCount: number;
  glyphsPerRow: number;
  key: string;
  texture: GPUTexture;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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

function getGlyphSet(settings: ConversionSettings) {
  if (settings.customCharset && settings.customCharset.trim().length >= 2) {
    return settings.customCharset;
  }

  return settings.charsetPreset === 'blocks'
    ? '█▓▒░ '
    : settings.charsetPreset === 'minimal'
      ? '#*:.'
      : settings.charsetPreset === 'dense'
        ? '@$B%8&WM#*oahkbdpqwmZO0QLCJYXzcvunxrjft/\\|()1{}[]?-_+~i!lI;:,`^. '
        : DEFAULT_CHARSET;
}

function parseHexColor(value: string | undefined, fallback: string) {
  const normalized = (value ?? fallback).replace('#', '');
  const source =
    normalized.length === 3
      ? normalized
          .split('')
          .map((part) => `${part}${part}`)
          .join('')
      : normalized.padEnd(6, '0').slice(0, 6);
  const red = Number.parseInt(source.slice(0, 2), 16) / 255;
  const green = Number.parseInt(source.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(source.slice(4, 6), 16) / 255;

  return [red, green, blue, 1] as const;
}

function getPreviewModeValue(mode: PreviewMode) {
  switch (mode) {
    case 'original':
      return 0;
    case 'final':
      return 1;
    case 'split':
    default:
      return 2;
  }
}

function getDitherModeValue(settings: ConversionSettings) {
  switch (settings.dithering) {
    case 'off':
      return 0;
    case 'ordered':
      return 1;
    case 'floyd-steinberg':
      return 2;
  }
}

function createCanvasTexture(
  device: GPUDevice,
  source: PreviewSourceImage | HTMLCanvasElement,
  width: number,
  height: number
) {
  const texture = device.createTexture({
    format: 'rgba8unorm',
    size: [Math.max(1, width), Math.max(1, height)],
    // `RENDER_ATTACHMENT` is required by the WebGPU spec for the destination
    // of `copyExternalImageToTexture`, even though we only sample from it.
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.RENDER_ATTACHMENT
  });

  device.queue.copyExternalImageToTexture(
    { source },
    { texture },
    [Math.max(1, width), Math.max(1, height)]
  );

  return texture;
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

function createGlyphAtlasCanvas(glyphs: string) {
  const cellSize = 32;
  const glyphCount = Math.max(1, glyphs.length);
  const glyphsPerRow = clamp(Math.ceil(Math.sqrt(glyphCount)), 1, glyphCount);
  const rows = Math.ceil(glyphCount / glyphsPerRow);
  const canvas = document.createElement('canvas');
  canvas.width = glyphsPerRow * cellSize;
  canvas.height = rows * cellSize;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Unable to create glyph atlas canvas.');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#ffffff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '28px "IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace';

  Array.from(glyphs).forEach((glyph, index) => {
    const column = index % glyphsPerRow;
    const row = Math.floor(index / glyphsPerRow);
    const centerX = column * cellSize + cellSize / 2;
    const centerY = row * cellSize + cellSize / 2 + 1;
    context.fillText(glyph, centerX, centerY);
  });

  return {
    canvas,
    cellSize,
    glyphCount,
    glyphsPerRow
  };
}

export class AsciiPreviewRenderer {
  readonly backend = 'webgpu' as const;

  static async create(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('webgpu');

    if (!context) {
      throw new Error('WebGPU canvas context is unavailable.');
    }

    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
      throw new Error('Unable to acquire a WebGPU adapter.');
    }

    const device = await adapter.requestDevice();
    const format = navigator.gpu.getPreferredCanvasFormat();
    const uniformBuffer = device.createBuffer({
      size: 176,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM
    });
    const sourceSampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear'
    });
    const atlasSampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear'
    });
    const shaderModule = device.createShaderModule({
      code: SHADER_CODE
    });
    const compilationInfo = await shaderModule.getCompilationInfo();
    const compilationErrors = compilationInfo.messages.filter(
      (message) => message.type === 'error'
    );

    if (compilationErrors.length > 0) {
      throw new Error(compilationErrors[0]?.message ?? 'WebGPU shader compilation failed.');
    }

    const pipeline = await device.createRenderPipelineAsync({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain'
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [
          {
            format
          }
        ]
      },
      primitive: {
        topology: 'triangle-list'
      }
    });
    const renderer = new AsciiPreviewRenderer(
      canvas,
      context,
      device,
      format,
      uniformBuffer,
      sourceSampler,
      atlasSampler,
      pipeline
    );

    renderer.configureCanvas();
    renderer.ensureAtlas(DEFAULT_CHARSET);
    renderer.createPlaceholderSourceTexture();

    return renderer;
  }

  private readonly canvas: HTMLCanvasElement;
  private readonly context: GPUCanvasContext;
  private readonly device: GPUDevice;
  private readonly format: GPUTextureFormat;
  private readonly uniformBuffer: GPUBuffer;
  private readonly sourceSampler: GPUSampler;
  private readonly atlasSampler: GPUSampler;
  private readonly pipeline: GPURenderPipeline;
  private bindGroup: GPUBindGroup | null = null;
  private atlasState: AtlasState | null = null;
  private currentSourceBitmap: PreviewSourceImage | null = null;
  private sourceTexture: GPUTexture | null = null;
  private canvasWidth = 0;
  private canvasHeight = 0;

  private constructor(
    canvas: HTMLCanvasElement,
    context: GPUCanvasContext,
    device: GPUDevice,
    format: GPUTextureFormat,
    uniformBuffer: GPUBuffer,
    sourceSampler: GPUSampler,
    atlasSampler: GPUSampler,
    pipeline: GPURenderPipeline
  ) {
    this.canvas = canvas;
    this.context = context;
    this.device = device;
    this.format = format;
    this.uniformBuffer = uniformBuffer;
    this.sourceSampler = sourceSampler;
    this.atlasSampler = atlasSampler;
    this.pipeline = pipeline;
  }

  private configureCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(320, Math.floor((rect.width || this.canvas.width || 960) * dpr));
    const height = Math.max(240, Math.floor((rect.height || this.canvas.height || 640) * dpr));

    if (width !== this.canvasWidth || height !== this.canvasHeight) {
      this.canvasWidth = width;
      this.canvasHeight = height;
      this.canvas.width = width;
      this.canvas.height = height;
      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: 'premultiplied'
      });
    }
  }

  private ensureAtlas(glyphs: string) {
    const key = glyphs;

    if (this.atlasState?.key === key) {
      return;
    }

    this.atlasState?.texture.destroy();

    const atlas = createGlyphAtlasCanvas(glyphs);
    const texture = createCanvasTexture(
      this.device,
      atlas.canvas,
      atlas.canvas.width,
      atlas.canvas.height
    );

    this.atlasState = {
      cellSize: atlas.cellSize,
      glyphCount: atlas.glyphCount,
      glyphsPerRow: atlas.glyphsPerRow,
      key,
      texture
    };

    // The existing bind group still references the previous (now destroyed)
    // atlas texture view. Rebuild it so the next draw call binds the fresh
    // texture — without this, changing `charsetPreset` (e.g. via a preset)
    // leaves the ASCII path sampling a destroyed texture and the scene
    // collapses to just the background color.
    this.refreshBindGroup();
  }

  private createPlaceholderSourceTexture() {
    this.sourceTexture?.destroy();
    this.currentSourceBitmap = null;

    const placeholderCanvas = document.createElement('canvas');
    placeholderCanvas.width = 1;
    placeholderCanvas.height = 1;
    const context = placeholderCanvas.getContext('2d');

    if (!context) {
      throw new Error('Unable to create placeholder source texture.');
    }

    context.fillStyle = '#000000';
    context.fillRect(0, 0, 1, 1);
    this.sourceTexture = createCanvasTexture(this.device, placeholderCanvas, 1, 1);
    this.refreshBindGroup();
  }

  private updateSourceTexture(bitmap: PreviewSourceImage | null) {
    if (bitmap === this.currentSourceBitmap && this.sourceTexture) {
      return;
    }

    this.currentSourceBitmap = bitmap;
    this.sourceTexture?.destroy();

    if (!bitmap) {
      this.createPlaceholderSourceTexture();
      return;
    }

    const { width, height } = getSourceDimensions(bitmap);
    this.sourceTexture = createCanvasTexture(this.device, bitmap, width, height);
    this.refreshBindGroup();
  }

  private refreshBindGroup() {
    if (!this.sourceTexture || !this.atlasState) {
      return;
    }

    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.uniformBuffer
          }
        },
        {
          binding: 1,
          resource: this.sourceTexture.createView()
        },
        {
          binding: 2,
          resource: this.sourceSampler
        },
        {
          binding: 3,
          resource: this.atlasState.texture.createView()
        },
        {
          binding: 4,
          resource: this.atlasSampler
        }
      ]
    });
  }

  private updateUniforms(state: EngineSessionState) {
    const source = state.source;
    const previewMode = state.previewState.mode;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    const originalBounds = { x: 24, y: 24, width: canvasWidth - 48, height: canvasHeight - 48 };
    const splitGap = 14;
    const splitWidth = (canvasWidth - 48 - splitGap) / 2;
    const originalRegion =
      previewMode === 'split' && source
        ? fitRectInto(
            { x: 24, y: 24, width: splitWidth, height: canvasHeight - 48 },
            source.width,
            source.height
          )
        : source
          ? fitRectInto(originalBounds, source.width, source.height)
          : originalBounds;
    const asciiRegion =
      previewMode === 'split' && source
        ? fitRectInto(
            {
              x: 24 + splitWidth + splitGap,
              y: 24,
              width: splitWidth,
              height: canvasHeight - 48
            },
            source.width,
            source.height
          )
        : source
          ? fitRectInto(originalBounds, source.width, source.height)
          : originalBounds;
    const aspect =
      source && source.width > 0 ? source.height / Math.max(1, source.width) : 0.5625;
    const grid = computeAsciiGridMetrics(
      asciiRegion,
      state.conversionSettings.density,
      aspect,
      state.conversionSettings.glyphAspect
    );
    const backgroundColor = parseHexColor(
      state.conversionSettings.backgroundColor,
      '#0a0a0c'
    );
    const glyphSet = getGlyphSet(state.conversionSettings);
    const blankGlyphIndex = findBlankGlyphIndex(glyphSet);
    const foregroundColor = parseHexColor(
      state.conversionSettings.foregroundColor,
      '#f4f4f5'
    );
    const atlasState = this.atlasState;
    const buffer = new Float32Array(44);

    buffer.set([canvasWidth, canvasHeight], 0);
    buffer.set([source?.width ?? 1, source?.height ?? 1], 2);
    buffer.set([originalRegion.x, originalRegion.y], 4);
    buffer.set([originalRegion.width, originalRegion.height], 6);
    buffer.set([asciiRegion.x, asciiRegion.y], 8);
    buffer.set([asciiRegion.width, asciiRegion.height], 10);
    buffer.set([grid.columns, grid.rows, grid.cellWidth, grid.cellHeight], 12);
    buffer.set(
      [
        state.conversionSettings.brightness / 100,
        state.conversionSettings.contrast / 100,
        state.conversionSettings.gamma,
        state.conversionSettings.invert ? 1 : 0
      ],
      16
    );
    buffer.set(
      [
        state.conversionSettings.detailBoost / 100,
        state.conversionSettings.colorMode === 'monochrome' ? 1 : 0,
        getPreviewModeValue(previewMode),
        getDitherModeValue(state.conversionSettings)
      ],
      20
    );
    buffer.set(
      [
        backgroundColor[0],
        backgroundColor[1],
        backgroundColor[2],
        blankGlyphIndex >= 0 ? 1 : 0
      ],
      24
    );
    buffer.set(
      [foregroundColor[0], foregroundColor[1], foregroundColor[2], Math.max(blankGlyphIndex, 0)],
      28
    );
    buffer.set(
      [
        atlasState?.glyphCount ?? 1,
        atlasState?.glyphsPerRow ?? 1,
        atlasState?.cellSize ?? 32,
        state.sourceBitmap ? 1 : 0
      ],
      32
    );
    buffer.set(
      [
        state.conversionSettings.sharpness / 100,
        state.conversionSettings.ditherIntensity,
        0,
        0
      ],
      36
    );

    this.device.queue.writeBuffer(this.uniformBuffer, 0, buffer);
  }

  render(state: EngineSessionState) {
    this.configureCanvas();
    this.ensureAtlas(getGlyphSet(state.conversionSettings));
    this.updateSourceTexture(state.sourceBitmap);
    this.updateUniforms(state);

    // Always refresh the bind group before draw. `GPUTextureView` objects
    // are one-shot handles into potentially-replaced textures; rebuilding
    // the group here makes sure a charset switch, preset change, or any
    // other path that rebuilds a backing texture can never leave us
    // sampling a destroyed texture view.
    this.refreshBindGroup();

    if (!this.bindGroup) {
      return;
    }

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
          view: this.context.getCurrentTexture().createView()
        }
      ]
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  destroy() {
    this.sourceTexture?.destroy();
    this.atlasState?.texture.destroy();
    this.currentSourceBitmap = null;
    this.context.unconfigure();
  }
}
