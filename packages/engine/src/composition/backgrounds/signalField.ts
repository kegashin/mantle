import { createRng, mixHex, parseHexToRgb, rgbToCss } from '../palette';
import type { MantleCanvasRenderingContext2D } from '../canvas';
import type { Rect } from '../types';
import type { BackgroundGenerator, BackgroundGeneratorInput } from './types';
import { clamp01, readBackgroundParam } from './utils';

const TWO_PI = Math.PI * 2;
const SIGNAL_FIELD_FRAGMENT_SHADER = `
  precision highp float;

  varying vec2 vUv;

  uniform vec2 uResolution;
  uniform vec3 uColor0;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform vec4 uParams;
  uniform float uSeed;
  uniform float uIntensity;

  float softSignal(float field, float width) {
    return width / max(abs(field), width * 0.72);
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / min(uResolution.x, uResolution.y);
    float density = clamp(uParams.x, 0.0, 1.0);
    float thickness = clamp(uParams.y, 0.0, 1.0);
    float glow = clamp(uParams.z, 0.0, 1.0);
    float seed = uSeed * 6.28318530718;
    float radius = length(uv);

    vec3 base = mix(uColor0, vec3(0.0), 0.55 + glow * 0.14);
    vec3 signal = vec3(0.0);
    float spacing = mix(0.31, 0.13, density);
    float lineWidth = mix(0.0018, 0.0085, thickness);
    float diagonal = mod(uv.x + uv.y + sin(seed) * 0.18, spacing);
    float phase = seed * 0.17 + density * 0.36;

    for (int channel = 0; channel < 3; channel++) {
      float fc = float(channel);
      float chroma = (fc - 1.0) * (0.009 + glow * 0.02);

      for (int band = 1; band < 7; band++) {
        float fb = float(band);
        float target = fract(phase - 0.012 * fc + fb * 0.017) * mix(2.0, 3.3, density);
        float wobble =
          sin(uv.x * (2.1 + fb * 0.23) + seed + fb) * 0.032 +
          sin(uv.y * (2.6 + fb * 0.17) - seed * 0.7 + fc) * 0.024;
        float field = target - radius + diagonal + wobble + chroma;
        float energy = softSignal(field, lineWidth) * fb * fb * 0.034;
        signal[channel] += energy;
      }
    }

    vec3 tint =
      signal.r * uColor2 +
      signal.g * mix(uColor1, uColor2, 0.48) +
      signal.b * uColor3;
    vec3 color =
      base +
      tint * (0.92 + glow * 2.8) * (0.58 + uIntensity * 1.05);

    // Broader halo keeps the line core from collapsing into a single tight band.
    float haloCore = exp(-pow((radius - (0.62 + sin(seed) * 0.12)) / 0.36, 2.0));
    float haloTail = exp(-pow((radius - 0.92) / 0.7, 2.0)) * 0.32;
    float halo = haloCore + haloTail;
    color += mix(uColor2, uColor3, smoothstep(-0.7, 0.9, uv.x - uv.y)) * halo * glow * 0.42;

    color = vec3(1.0) - exp(-color);
    color = pow(color, vec3(0.84));

    // Keep the vignette light enough to preserve corner signal detail.
    float vignette = smoothstep(1.6, 0.25, radius);
    color = mix(color * 0.55, color, vignette);

    gl_FragColor = vec4(color, 1.0);
  }
`;

function drawBackgroundWash(
  ctx: MantleCanvasRenderingContext2D,
  rect: Rect,
  background: string,
  accent: string,
  glow: number
): void {
  const centerX = rect.x + rect.width * 0.5;
  const centerY = rect.y + rect.height * 0.5;
  const reach = Math.hypot(rect.width, rect.height);
  const accentRgb = parseHexToRgb(accent);

  const base = ctx.createRadialGradient(
    centerX,
    centerY,
    reach * 0.04,
    centerX,
    centerY,
    reach * 0.72
  );
  base.addColorStop(0, mixHex(background, accent, 0.16 + glow * 0.08));
  base.addColorStop(0.52, background);
  base.addColorStop(1, mixHex(background, '#000000', 0.48));
  ctx.fillStyle = base;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const corner = ctx.createRadialGradient(
    rect.x + rect.width * 0.12,
    rect.y + rect.height * 0.15,
    0,
    rect.x + rect.width * 0.12,
    rect.y + rect.height * 0.15,
    reach * 0.55
  );
  corner.addColorStop(0, rgbToCss(accentRgb, 0.08 + glow * 0.08));
  corner.addColorStop(1, rgbToCss(accentRgb, 0));
  ctx.fillStyle = corner;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
}

function drawDiagonalLattice({
  ctx,
  rect,
  color,
  density,
  glow,
  scale
}: {
  ctx: MantleCanvasRenderingContext2D;
  rect: Rect;
  color: string;
  density: number;
  glow: number;
  scale: number;
}): void {
  const rgb = parseHexToRgb(color);
  const spacing = Math.max(22 * scale, Math.min(rect.width, rect.height) * (0.18 - density * 0.1));
  const start = rect.x - rect.height;
  const end = rect.x + rect.width + rect.height;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = rgbToCss(rgb, 0.025 + glow * 0.055);
  ctx.lineWidth = Math.max(0.7, scale * (0.7 + density * 1.4));
  ctx.shadowColor = rgbToCss(rgb, 0.25 + glow * 0.25);
  ctx.shadowBlur = Math.max(0, scale * (8 + glow * 20));

  for (let offset = start; offset < end; offset += spacing) {
    ctx.beginPath();
    ctx.moveTo(offset, rect.y + rect.height);
    ctx.lineTo(offset + rect.height, rect.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDistortedBand({
  ctx,
  centerX,
  centerY,
  radius,
  amplitude,
  phase,
  aspect,
  steps
}: {
  ctx: MantleCanvasRenderingContext2D;
  centerX: number;
  centerY: number;
  radius: number;
  amplitude: number;
  phase: number;
  aspect: number;
  steps: number;
}): void {
  ctx.beginPath();
  for (let step = 0; step <= steps; step += 1) {
    const theta = (step / steps) * TWO_PI;
    const wobble =
      Math.sin(theta * 2.0 + phase) * amplitude +
      Math.sin(theta * 4.6 - phase * 0.72) * amplitude * 0.42 +
      Math.sin((Math.cos(theta) + Math.sin(theta)) * 9.0 + phase) * amplitude * 0.18;
    const nextRadius = radius + wobble;
    const x = centerX + Math.cos(theta) * nextRadius * aspect;
    const y = centerY + Math.sin(theta) * nextRadius;

    if (step === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.stroke();
}

async function drawShaderVersion({
  ctx,
  rect,
  palette,
  intensity,
  params,
  seed,
  scale
}: BackgroundGeneratorInput): Promise<boolean> {
  const { drawShaderBackground } = await import('./shaderBackground');
  return drawShaderBackground({
    ctx,
    rect,
    palette,
    params,
    uniformParams: [
      clamp01(params.lineDensity ?? intensity),
      clamp01(params.thickness ?? 0.34),
      clamp01(params.glow ?? 0.82),
      0
    ],
    seed,
    intensity,
    scale,
    shaderKey: 'signal-field-v2',
    fragmentShader: SIGNAL_FIELD_FRAGMENT_SHADER
  });
}

export const signalField: BackgroundGenerator = async ({
  ctx,
  rect,
  palette,
  intensity,
  params,
  seed,
  renderMode,
  scale
}) => {
  if (
    await drawShaderVersion({
      ctx,
      rect,
      palette,
      params,
      seed,
      intensity,
      renderMode,
      scale,
    })
  ) {
    return;
  }

  const rng = createRng(`signal-field::${seed}`);
  const lineDensity = readBackgroundParam(params, 'lineDensity', intensity);
  const thickness = readBackgroundParam(params, 'thickness', 0.34);
  const glow = readBackgroundParam(params, 'glow', 0.82);
  const isPreview = renderMode === 'preview';
  const strength = clamp01(intensity || 0.76);
  const centerX = rect.x + rect.width * (0.47 + (rng() - 0.5) * 0.12);
  const centerY = rect.y + rect.height * (0.5 + (rng() - 0.5) * 0.12);
  const shortSide = Math.min(rect.width, rect.height);
  const maxRadius = Math.hypot(rect.width, rect.height) * 0.72;
  const bandCount = Math.round((16 + lineDensity * 34) * (isPreview ? 0.72 : 1));
  const baseStep = maxRadius / Math.max(1, bandCount);
  const colors = [
    palette.accent,
    palette.foreground,
    palette.muted ?? mixHex(palette.accent, palette.foreground, 0.5)
  ];

  drawBackgroundWash(ctx, rect, palette.background, palette.accent, glow);
  drawDiagonalLattice({
    ctx,
    rect,
    color: palette.accent,
    density: lineDensity,
    glow,
    scale
  });

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let channel = 0; channel < colors.length; channel += 1) {
    const rgb = parseHexToRgb(colors[channel]!);
    const channelOffset = (channel - 1) * shortSide * (0.006 + glow * 0.006);
    ctx.strokeStyle = rgbToCss(rgb, (0.11 + glow * 0.13) * strength);
    ctx.lineWidth = Math.max(0.75, scale * (0.8 + thickness * 3.4));
    ctx.shadowColor = rgbToCss(rgb, 0.42 + glow * 0.3);
    ctx.shadowBlur = Math.max(0, scale * (10 + glow * 42));

    for (let band = 1; band <= bandCount; band += 1) {
      const normalized = band / bandCount;
      const radius = band * baseStep * (0.72 + normalized * 0.4);
      const alpha = (1 - normalized * 0.64) * (0.38 + glow * 0.62);
      if (alpha < 0.08) continue;
      ctx.globalAlpha = alpha;
      drawDistortedBand({
        ctx,
        centerX: centerX + channelOffset,
        centerY: centerY - channelOffset * 0.55,
        radius,
        amplitude: shortSide * (0.01 + lineDensity * 0.015) * (0.5 + normalized),
        phase: rng() * TWO_PI + channel * 0.9,
        aspect: 1 + Math.sin(channel + 0.5) * 0.08,
        steps: isPreview ? 96 : 168
      });
    }
  }

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  const vignette = ctx.createRadialGradient(
    centerX,
    centerY,
    shortSide * 0.2,
    centerX,
    centerY,
    maxRadius
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.48)');
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = vignette;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
};
