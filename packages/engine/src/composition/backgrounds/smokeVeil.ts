import { createRng, mixHex, parseHexToRgb, rgbToCss } from '../palette';
import type { MantleCanvasRenderingContext2D } from '../canvas';
import type { Rect } from '../types';
import type { BackgroundGenerator, BackgroundGeneratorInput } from './types';
import { clamp01, readBackgroundParam } from './utils';

const SMOKE_VEIL_FRAGMENT_SHADER = `
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
  uniform float uTime;

  float rnd(vec2 p) {
    p = fract(p * vec2(12.9898, 78.233));
    p += dot(p, p + 34.56 + uSeed);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(rnd(i), rnd(i + vec2(1.0, 0.0)), u.x),
      mix(rnd(i + vec2(0.0, 1.0)), rnd(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float total = 0.0;
    float amplitude = 0.55;
    mat2 warp = mat2(1.0, -1.2, 0.2, 1.2);
    for (int i = 0; i < 5; i++) {
      total += amplitude * noise(p);
      p = warp * p * 2.0;
      amplitude *= 0.5;
    }
    return total;
  }

  mat2 rotate2d(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
  }

  vec2 swirl(vec2 uv, vec2 center, float strength, float radius) {
    vec2 delta = uv - center;
    float weight = exp(-dot(delta, delta) / max(radius, 0.001));
    return center + rotate2d(strength * weight) * delta;
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;
    float details = clamp(uParams.x, 0.0, 1.0);
    float glow = clamp(uParams.y, 0.0, 1.0);
    float grain = clamp(uParams.z, 0.0, 1.0);
    float time = 660.0 + uSeed * 96.0 + uTime;

    uv.x += 0.12 + sin(uSeed * 6.28318530718) * 0.04;
    uv *= vec2(1.34 + details * 0.22, 1.0);

    vec2 wideWarp = vec2(
      fbm(uv * (0.54 + details * 0.18) + vec2(time * 0.006, uSeed * 4.7)),
      fbm(uv * (0.62 + details * 0.22) + vec2(-time * 0.004, uSeed * 7.1) + 8.3)
    ) - 0.5;
    uv += wideWarp * (0.42 + details * 0.44);
    uv.x += sin(uv.y * (2.1 + details * 1.9) + time * 0.018 + uSeed * 9.0) * (0.11 + details * 0.1);
    uv.y += cos(uv.x * (1.6 + details * 1.4) - time * 0.014 + uSeed * 5.0) * (0.06 + details * 0.07);
    uv = swirl(uv, vec2(-0.46 + wideWarp.x * 0.22, -0.22 + wideWarp.y * 0.16), 1.45 + details * 1.1, 0.72);
    uv = swirl(uv, vec2(0.54 - wideWarp.y * 0.18, 0.28 + wideWarp.x * 0.14), -1.2 - details * 0.9, 0.86);

    float n = fbm(uv * (0.2 + details * 0.17) - vec2(time * 0.01, 0.0));
    n = noise(uv * (2.0 + details * 1.35) + n * (1.85 + details * 1.55));

    vec3 smoke = vec3(1.0);
    smoke.r -= fbm(uv + vec2(0.0, time * 0.015) + n + wideWarp * 0.32);
    smoke.g -= fbm(uv * 1.003 + vec2(0.0, time * 0.015) + n + wideWarp * 0.34 + 0.003);
    smoke.b -= fbm(uv * 1.006 + vec2(0.0, time * 0.015) + n + wideWarp * 0.36 + 0.006);
    smoke = clamp(smoke, 0.0, 1.0);

    float smokeMask = dot(smoke, vec3(0.21, 0.71, 0.07));
    float canvasFalloff = smoothstep(1.86, 0.08, length(uv * vec2(0.46, 0.86)));
    vec3 base = mix(uColor0, vec3(0.08), 0.7);
    // Accent tint keeps smoke colorized under the white fbm noise.
    vec3 tint = mix(uColor2, mix(uColor1, uColor3, 0.36), 0.32);
    vec3 stained = tint * (0.4 + smokeMask * 0.85);
    vec3 color = mix(smoke * 0.4, stained, smokeMask * (0.7 + glow * 0.3));
    color = mix(base, color, canvasFalloff * (0.55 + uIntensity * 0.5));

    // Low-edge glow gives the smoke a grounded base.
    float horizon = smoothstep(-0.95, -0.2, -uv.y) * (0.18 + glow * 0.18);
    color += mix(uColor2, uColor3, 0.65) * horizon * canvasFalloff;

    color += tint * pow(smokeMask, 3.2) * glow * 0.26;
    color += (rnd(gl_FragCoord.xy + time) - 0.5) * grain * 0.06;
    color = clamp(color, 0.035, 1.0);
    color = vec3(1.0) - exp(-max(color, vec3(0.0)) * (0.92 + glow * 0.18));
    color = mix(color * 0.5, color, canvasFalloff);

    gl_FragColor = vec4(color, 1.0);
  }
`;

function drawSmokeStroke({
  ctx,
  rect,
  y,
  color,
  alpha,
  lineWidth,
  blur,
  phase,
  rng
}: {
  ctx: MantleCanvasRenderingContext2D;
  rect: Rect;
  y: number;
  color: string;
  alpha: number;
  lineWidth: number;
  blur: number;
  phase: number;
  rng: () => number;
}): void {
  const rgb = parseHexToRgb(color);
  const startX = rect.x - rect.width * (0.12 + rng() * 0.12);
  const endX = rect.x + rect.width * (1.12 + rng() * 0.12);
  const lift = rect.height * (0.14 + rng() * 0.28);
  const sway = rect.width * (0.18 + rng() * 0.26);
  const midX = rect.x + rect.width * (0.44 + (rng() - 0.5) * 0.28);
  const midY = y + (rng() - 0.5) * lift * 1.4;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.filter = `blur(${blur.toFixed(2)}px)`;
  ctx.strokeStyle = rgbToCss(rgb, alpha);
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(startX, y + Math.sin(phase) * lift * 0.32);
  ctx.bezierCurveTo(
    rect.x + rect.width * 0.12 + Math.sin(phase * 0.9) * sway * 0.28,
    y - lift * (0.85 + rng() * 0.5),
    midX - sway * 0.18,
    midY + lift * (0.45 + rng() * 0.5),
    midX,
    midY
  );
  ctx.bezierCurveTo(
    rect.x + rect.width * 0.66 + Math.cos(phase * 1.2) * sway * 0.24,
    midY - lift * (0.9 + rng() * 0.5),
    rect.x + rect.width * 0.86 + Math.sin(phase) * sway * 0.34,
    y + lift * (0.45 + rng() * 0.55),
    endX,
    y + Math.cos(phase) * lift * 0.24
  );
  ctx.stroke();
  ctx.restore();
}

function drawGrain({
  ctx,
  rect,
  grain,
  scale,
  rng
}: {
  ctx: MantleCanvasRenderingContext2D;
  rect: Rect;
  grain: number;
  scale: number;
  rng: () => number;
}): void {
  if (grain <= 0) return;

  const count = Math.round((220 + grain * 1200) * Math.min(2, (rect.width * rect.height) / (1600 * 900)));
  ctx.save();
  ctx.fillStyle = `rgba(255, 255, 255, ${(0.012 + grain * 0.025).toFixed(3)})`;
  for (let i = 0; i < count; i += 1) {
    const size = Math.max(0.4, scale * (0.45 + rng() * 0.8));
    ctx.fillRect(rect.x + rng() * rect.width, rect.y + rng() * rect.height, size, size);
  }
  ctx.restore();
}

async function drawShaderVersion({
  ctx,
  rect,
  palette,
  intensity,
  params,
  seed,
  scale,
  timeMs
}: BackgroundGeneratorInput): Promise<boolean> {
  const { drawShaderBackground } = await import('./shaderBackground');
  return drawShaderBackground({
    ctx,
    rect,
    palette,
    params,
    uniformParams: [
      clamp01(params.details ?? 0.62),
      clamp01(params.glow ?? intensity),
      clamp01(params.grain ?? 0.08),
      0
    ],
    seed,
    intensity,
    scale,
    timeMs,
    shaderKey: 'smoke-veil-v5',
    fragmentShader: SMOKE_VEIL_FRAGMENT_SHADER
  });
}

export const smokeVeil: BackgroundGenerator = async ({
  ctx,
  rect,
  palette,
  intensity,
  params,
  seed,
  renderMode,
  timeMs,
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
      timeMs
    })
  ) {
    return;
  }

  const rng = createRng(`smoke-veil::${seed}`);
  const details = readBackgroundParam(params, 'details', 0.62);
  const glow = readBackgroundParam(params, 'glow', intensity);
  const grain = readBackgroundParam(params, 'grain', 0.08);
  const preview = renderMode === 'preview';
  const time = timeMs / 1000;
  const reach = Math.hypot(rect.width, rect.height);
  const accentRgb = parseHexToRgb(palette.accent);

  const base = ctx.createRadialGradient(
    rect.x + rect.width * 0.52,
    rect.y + rect.height * 0.5,
    reach * 0.04,
    rect.x + rect.width * 0.52,
    rect.y + rect.height * 0.5,
    reach * 0.92
  );
  base.addColorStop(0, mixHex(palette.background, palette.foreground, 0.09));
  base.addColorStop(0.52, palette.background);
  base.addColorStop(1, mixHex(palette.background, '#000000', 0.44));
  ctx.fillStyle = base;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const glowWash = ctx.createRadialGradient(
    rect.x + rect.width * 0.28,
    rect.y + rect.height * 0.7,
    0,
    rect.x + rect.width * 0.28,
    rect.y + rect.height * 0.7,
    reach * 0.82
  );
  glowWash.addColorStop(0, rgbToCss(accentRgb, 0.08 + glow * 0.14));
  glowWash.addColorStop(0.46, rgbToCss(accentRgb, 0.035 + glow * 0.06));
  glowWash.addColorStop(1, rgbToCss(accentRgb, 0));
  ctx.fillStyle = glowWash;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const strokes = Math.round((12 + details * 34) * (preview ? 0.64 : 1));
  const colors = [palette.foreground, palette.accent, palette.muted ?? palette.foreground];
  for (let i = 0; i < strokes; i += 1) {
    const normalized = i / Math.max(1, strokes - 1);
    const drift = time * (0.12 + i * 0.006) + i * 0.73;
    const y =
      rect.y +
      rect.height * (0.02 + normalized * 0.96) +
      (rng() - 0.5) * rect.height * 0.24 +
      Math.sin(drift) * rect.height * 0.035;
    const color = colors[i % colors.length]!;
    const alpha = (0.024 + glow * 0.04) * (0.62 + rng() * 0.52);
    const width = Math.max(10, scale * (28 + details * 62) * (0.72 + rng() * 0.86));
    const blur = Math.max(6, scale * (14 + glow * 42) * (0.78 + rng() * 0.5));

    drawSmokeStroke({
      ctx,
      rect,
      y,
      color,
      alpha,
      lineWidth: width,
      blur,
      phase: rng() * Math.PI * 2 + time * (0.18 + i * 0.004),
      rng
    });
  }

  drawGrain({ ctx, rect, grain, scale, rng });
};
