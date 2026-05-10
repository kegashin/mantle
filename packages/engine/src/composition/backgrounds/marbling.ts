import { createRng, mixHex, parseHexToRgb, rgbToCss } from '../palette';
import type { BackgroundGenerator, BackgroundGeneratorInput } from './types';
import {
  clampRange,
  drawPixelGrain,
  readBackgroundParam,
  resolveProvidedBackgroundColors
} from './utils';

const TWO_PI = Math.PI * 2;
const MARBLING_ANIMATION_SPEED = 1.85;

const MARBLING_FRAGMENT_SHADER = `
  precision highp float;

  varying vec2 vUv;

  uniform vec2 uResolution;
  uniform vec3 uColor0;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform vec3 uColor4;
  uniform vec3 uColor5;
  uniform vec4 uParams;
  uniform float uColorCount;
  uniform float uSeed;
  uniform float uIntensity;
  uniform float uTime;

  float hash11(float p) {
    return fract(sin(p * 127.1 + uSeed * 311.7) * 43758.5453123);
  }

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32 + uSeed);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float total = 0.0;
    float amplitude = 0.55;
    for (int i = 0; i < 4; i++) {
      total += amplitude * noise(p);
      p *= 2.07;
      amplitude *= 0.5;
    }
    return total;
  }

  vec3 pickColor(int index) {
    float wrapped = mod(float(index), max(2.0, floor(uColorCount + 0.5)));
    if (wrapped < 0.5) return uColor0;
    if (wrapped < 1.5) return uColor1;
    if (wrapped < 2.5) return uColor2;
    if (wrapped < 3.5) return uColor3;
    if (wrapped < 4.5) return uColor4;
    return uColor5;
  }

  vec2 anchorAt(int idx) {
    float fi = float(idx);
    float anchorTime = uTime * 0.12;
    float angle =
      fi * 2.39996323 +
      uSeed * 6.28318530718 +
      sin(anchorTime * 0.73 + fi * 1.17) * 0.045;
    float ring =
      mix(0.58, 1.04, hash11(fi * 13.3 + 2.0)) +
      sin(anchorTime * 0.91 + fi * 1.93 + uSeed * 4.0) * 0.035;
    vec2 base = vec2(cos(angle) * ring, sin(angle) * ring * 0.72);
    vec2 jitter = vec2(
      hash11(fi * 17.0 + 3.1) - 0.5,
      hash11(fi * 17.0 + 11.7) - 0.5
    ) * 0.24;
    vec2 drift = vec2(
      sin(anchorTime + fi * 2.31 + uSeed * 5.0),
      cos(anchorTime * 0.82 + fi * 1.71 + uSeed * 7.0)
    ) * 0.04;
    return base + jitter + drift;
  }

  vec2 anchorLight(int idx) {
    float angle = hash11(float(idx) * 23.0 + 5.1) * 6.28318530718;
    return vec2(cos(angle), sin(angle));
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / min(uResolution.x, uResolution.y);

    float complexity = clamp(uParams.x, 0.0, 2.0);
    float sharpness = clamp(uParams.y, 0.0, 2.0);
    float curve = clamp(uParams.z, 0.0, 4.0);
    float grain = clamp(uParams.w, 0.0, 2.0);

    int regionCount = int(floor(mix(3.0, 7.0, min(complexity, 1.0)) + max(0.0, complexity - 1.0) * 4.0 + 0.5));
    float flowTime = uTime * 0.075;
    vec2 flowA = vec2(
      cos(flowTime + uSeed * 6.28318530718),
      sin(flowTime * 0.73 + uSeed * 4.0)
    );
    vec2 flowB = vec2(
      sin(flowTime * 0.61 + 2.1 + uSeed * 2.0),
      cos(flowTime * 0.89 + 1.4 + uSeed * 3.0)
    );

    vec2 warpA = vec2(
      fbm(uv * (1.2 + curve * 0.9) + 1.7 + flowA * 0.5),
      fbm(uv * (1.2 + curve * 0.9) + 4.3 - flowA.yx * 0.45)
    ) - 0.5;
    vec2 warpB = vec2(
      fbm(uv * (2.6 + curve * 1.4) - warpA * 0.5 + 8.1 + flowB * 0.65),
      fbm(uv * (2.6 + curve * 1.4) - warpA * 0.5 + 12.7 - flowB.yx * 0.58)
    ) - 0.5;
    vec2 distortedUv =
      uv + warpA * (0.36 + curve * 0.95) + warpB * (0.12 + curve * 0.46);

    // First two anchors choose the blended colors; the third softens triple-junctions.
    float bestDist = 1e9;
    float secondDist = 1e9;
    float thirdDist = 1e9;
    int bestIdx = 0;
    int secondIdx = 0;
    int thirdIdx = 0;
    vec2 bestAnchor = vec2(0.0);

    for (int i = 0; i < 7; i++) {
      if (i >= regionCount) break;
      vec2 anchor = anchorAt(i);
      float d = distance(distortedUv, anchor);
      if (d < bestDist) {
        thirdDist = secondDist;
        thirdIdx = secondIdx;
        secondDist = bestDist;
        secondIdx = bestIdx;
        bestDist = d;
        bestIdx = i;
        bestAnchor = anchor;
      } else if (d < secondDist) {
        thirdDist = secondDist;
        thirdIdx = secondIdx;
        secondDist = d;
        secondIdx = i;
      } else if (d < thirdDist) {
        thirdDist = d;
        thirdIdx = i;
      }
    }

    float boundary = secondDist - bestDist;
    float edgeWidth =
      mix(0.34, 0.018, min(sharpness, 1.0)) -
      max(0.0, sharpness - 1.0) * 0.012;
    edgeWidth = max(0.006, edgeWidth);
    float blend = smoothstep(0.0, edgeWidth, boundary);

    vec3 colorA = pickColor(bestIdx);
    vec3 colorB = pickColor(secondIdx);
    vec3 colorC = pickColor(thirdIdx);
    vec3 color = mix(colorB, colorA, blend);
    color = mix(uColor0, color, 0.82);

    // Soften joins only when a third region is close enough to affect the edge.
    float tripleProx = smoothstep(edgeWidth * 1.4, 0.0, thirdDist - bestDist);
    color = mix(color, (color + colorC) * 0.5, tripleProx * 0.3 * max(0.0, 1.0 - sharpness * 0.6));

    // Per-region light vectors keep adjacent zones from sharing one gradient axis.
    vec2 lightDir = anchorLight(bestIdx);
    vec2 regionDelta = distortedUv - bestAnchor;
    float regionLight = 0.5 + 0.5 * dot(normalize(regionDelta + vec2(0.001)), lightDir);
    color *= mix(0.84, 1.18, regionLight);

    // Low-frequency fbm modulates brightness within each region.
    float brush =
      fbm(distortedUv * (2.6 + curve * 1.0) + bestAnchor * 7.0 + uSeed * 3.7 + flowA * 0.34) - 0.5;
    color *= 1.0 + brush * 0.08;

    // Boundary highlight near region edges.
    float edgeGlow = exp(-pow(boundary / max(0.012, edgeWidth * 0.85), 2.0));
    color += edgeGlow * max(0.018, 0.05 + (1.0 - sharpness) * 0.08);

    // Inner glow toward each anchor centre, brighter at higher complexity.
    float anchorGlow = exp(-bestDist * (2.6 + (1.0 - complexity) * 1.0));
    color += colorA * anchorGlow * (0.06 + uIntensity * 0.12);

    color += (hash21(gl_FragCoord.xy + uSeed * 91.7) - 0.5) * grain * 0.07;

    color = vec3(1.0) - exp(-color * (0.92 + uIntensity * 0.18));
    color = pow(color, vec3(0.9));

    float radius = length(uv);
    color = mix(color * 0.74, color, smoothstep(1.65, 0.32, radius));

    gl_FragColor = vec4(color, 1.0);
  }
`;

function resolveMarblingColors(
  colors: string[] | undefined,
  palette: Parameters<BackgroundGenerator>[0]['palette']
): string[] {
  const provided = resolveProvidedBackgroundColors(colors);
  if (provided) return provided;

  return [
    palette.background,
    palette.accent,
    palette.muted ?? mixHex(palette.foreground, palette.background, 0.4),
    mixHex(palette.accent, palette.foreground, 0.32)
  ];
}

async function drawShaderVersion({
  ctx,
  rect,
  palette,
  colors,
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
    colors: resolveMarblingColors(colors, palette),
    params,
    uniformParams: [
      clampRange(params.complexity ?? 0.5, 2),
      clampRange(params.sharpness ?? 0.42, 2),
      clampRange(params.curve ?? 0.62, 4),
      clampRange(params.grain ?? 0.06, 2)
    ],
    seed,
    intensity,
    scale,
    timeMs: timeMs * MARBLING_ANIMATION_SPEED,
    shaderKey: 'marbling-v5',
    fragmentShader: MARBLING_FRAGMENT_SHADER
  });
}

export const marbling: BackgroundGenerator = async ({
  ctx,
  rect,
  palette,
  colors,
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
      colors,
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

  // Canvas2D fallback uses deterministic polygonal regions with radial washes.
  const rng = createRng(`marbling::${seed}`);
  const complexity = readBackgroundParam(params, 'complexity', 0.5, 2);
  const curve = readBackgroundParam(params, 'curve', 0.62, 4);
  const grain = readBackgroundParam(params, 'grain', 0.06, 2);
  const strength = clampRange(intensity || 0.78, 1);
  const preview = renderMode === 'preview';
  const time = (timeMs / 1000) * MARBLING_ANIMATION_SPEED;
  const palette_colors = resolveMarblingColors(colors, palette);
  const regionCount = Math.max(
    3,
    Math.round(3 + Math.min(complexity, 1) * 4 + Math.max(0, complexity - 1) * 4)
  );
  const reach = Math.hypot(rect.width, rect.height);

  ctx.fillStyle = palette.background;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  for (let i = 0; i < regionCount; i += 1) {
    const color = palette_colors[i % palette_colors.length]!;
    const drift = time * (0.08 + i * 0.011) + i * 2.399963229728653;
    const cx =
      rect.x +
      rect.width * (0.1 + rng() * 0.8) +
      Math.cos(drift) * rect.width * 0.035;
    const cy =
      rect.y +
      rect.height * (0.1 + rng() * 0.8) +
      Math.sin(drift * 0.83) * rect.height * 0.035;
    const radius = reach * (0.35 + rng() * 0.25 + curve * 0.18);

    const gradient = ctx.createRadialGradient(cx, cy, reach * 0.02, cx, cy, radius);
    const colorRgb = parseHexToRgb(color);
    gradient.addColorStop(0, rgbToCss(colorRgb, 0.85 * strength));
    gradient.addColorStop(0.55, rgbToCss(colorRgb, 0.32 * strength));
    gradient.addColorStop(1, rgbToCss(colorRgb, 0));

    ctx.beginPath();
    const points = 14 + Math.floor(rng() * 10);
    for (let p = 0; p < points; p += 1) {
      const angle = (p / points) * TWO_PI;
      const wobble = 1 + (rng() - 0.5) * (0.3 + curve * 0.4);
      const px = cx + Math.cos(angle) * radius * wobble;
      const py = cy + Math.sin(angle) * radius * wobble;
      if (p === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  ctx.restore();

  const vignette = ctx.createRadialGradient(
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
    Math.min(rect.width, rect.height) * 0.42,
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
    reach * 0.78
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.32)');
  ctx.fillStyle = vignette;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  if (grain > 0) {
    const grainRgb = parseHexToRgb('#ffffff');
    const count = Math.round((preview ? 320 : 1100) * (0.4 + grain * 0.7));
    drawPixelGrain({
      ctx,
      rect,
      rng,
      count,
      fillStyle: rgbToCss(grainRgb, 0.018 * (0.5 + grain * 0.7)),
      scale
    });
  }
};
