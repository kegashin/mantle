import {
  Camera,
  Color,
  Mesh,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector4,
  WebGLRenderer,
  type IUniform
} from 'three';

import type {
  MantleBackgroundParamId,
  MantleBackgroundParams,
  MantlePalette
} from '@mantle/schemas/model';

import type { MantleCanvasRenderingContext2D } from '../canvas';
import { parseHexToRgb } from '../palette';
import type { Rect } from '../types';

type ShaderBackgroundUniforms = Record<string, IUniform> & {
  uResolution: IUniform<Vector2>;
  uColor0: IUniform<Color>;
  uColor1: IUniform<Color>;
  uColor2: IUniform<Color>;
  uColor3: IUniform<Color>;
  uColor4: IUniform<Color>;
  uColor5: IUniform<Color>;
  uParams: IUniform<Vector4>;
  uColorCount: IUniform<number>;
  uSeed: IUniform<number>;
  uIntensity: IUniform<number>;
  uScale: IUniform<number>;
  uTime: IUniform<number>;
};

type ShaderBackgroundMaterial = ShaderMaterial & {
  uniforms: ShaderBackgroundUniforms;
};

type ShaderBackgroundInput = {
  ctx: MantleCanvasRenderingContext2D;
  rect: Rect;
  palette: MantlePalette;
  params: MantleBackgroundParams;
  colors?: readonly string[] | undefined;
  uniformParams?: readonly [number, number, number, number] | undefined;
  seed: string;
  intensity: number;
  scale: number;
  timeMs: number;
  fragmentShader: string;
  shaderKey: string;
};

const VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

function seedToUnit(seed: string): number {
  let state = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 0x01000193) >>> 0;
  }
  return (state >>> 0) / 0xffffffff;
}

function colorUniform(hex: string | undefined, fallback: string): Color {
  const rgb = parseHexToRgb(hex ?? fallback);
  return new Color(rgb.r / 255, rgb.g / 255, rgb.b / 255);
}

function shaderColor(
  input: ShaderBackgroundInput,
  index: number,
  fallback: string
): Color {
  return colorUniform(input.colors?.[index], fallback);
}

function param(
  params: MantleBackgroundParams,
  key: MantleBackgroundParamId,
  fallback: number
): number {
  const value = params[key];
  return Math.min(4, Math.max(0, value ?? fallback));
}

function createShaderCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  throw new Error('WebGL canvas is not available in this environment.');
}

class ThreeShaderBackgroundRenderer {
  private readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly camera = new Camera();
  private readonly scene = new Scene();
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly mesh: Mesh<PlaneGeometry, ShaderBackgroundMaterial>;
  private readonly renderer: WebGLRenderer;
  private materialKey = '';

  constructor() {
    this.canvas = createShaderCanvas(1, 1);
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = true;

    const material = this.createMaterial('', '');
    this.mesh = new Mesh(this.geometry, material);
    this.scene.add(this.mesh);
  }

  render(input: ShaderBackgroundInput): HTMLCanvasElement | OffscreenCanvas {
    const width = Math.max(1, Math.ceil(input.rect.width));
    const height = Math.max(1, Math.ceil(input.rect.height));

    this.renderer.setSize(width, height, false);
    this.updateMaterial(input);
    this.renderer.render(this.scene, this.camera);

    return this.canvas;
  }

  dispose(): void {
    this.mesh.material.dispose();
    this.geometry.dispose();
    this.renderer.dispose();
  }

  private updateMaterial(input: ShaderBackgroundInput): void {
    if (this.materialKey !== input.shaderKey) {
      this.mesh.material.dispose();
      this.mesh.material = this.createMaterial(input.shaderKey, input.fragmentShader);
      this.materialKey = input.shaderKey;
    }

    const uniforms = this.mesh.material.uniforms;
    const width = Math.max(1, Math.ceil(input.rect.width));
    const height = Math.max(1, Math.ceil(input.rect.height));
    const seed = seedToUnit(input.seed);

    uniforms.uResolution.value.set(width, height);
    uniforms.uColor0.value.copy(shaderColor(input, 0, input.palette.background));
    uniforms.uColor1.value.copy(shaderColor(input, 1, input.palette.foreground));
    uniforms.uColor2.value.copy(shaderColor(input, 2, input.palette.accent));
    uniforms.uColor3.value.copy(
      shaderColor(input, 3, input.palette.muted ?? input.palette.accent)
    );
    uniforms.uColor4.value.copy(shaderColor(input, 4, input.palette.accent));
    uniforms.uColor5.value.copy(
      shaderColor(input, 5, input.palette.muted ?? input.palette.foreground)
    );
    uniforms.uColorCount.value = Math.max(
      2,
      Math.min(6, input.colors?.filter(Boolean).slice(0, 6).length ?? 4)
    );
    const uniformParams = input.uniformParams ?? [
      param(input.params, 'lineDensity', input.intensity),
      param(input.params, 'thickness', 0.34),
      param(input.params, 'glow', input.intensity),
      param(input.params, 'grain', 0)
    ];
    uniforms.uParams.value.set(...uniformParams);
    uniforms.uSeed.value = seed;
    uniforms.uIntensity.value = Math.min(1, Math.max(0, input.intensity));
    uniforms.uScale.value = Math.max(0.01, input.scale);
    uniforms.uTime.value = Math.max(0, input.timeMs) / 1000;
  }

  private createMaterial(
    shaderKey: string,
    fragmentShader: string
  ): ShaderBackgroundMaterial {
    const uniforms: ShaderBackgroundUniforms = {
      uResolution: { value: new Vector2(1, 1) },
      uColor0: { value: new Color(0, 0, 0) },
      uColor1: { value: new Color(1, 1, 1) },
      uColor2: { value: new Color(0, 0.65, 1) },
      uColor3: { value: new Color(0.35, 0.3, 1) },
      uColor4: { value: new Color(0.9, 0.55, 0.25) },
      uColor5: { value: new Color(0.15, 0.8, 0.72) },
      uParams: { value: new Vector4(0, 0, 0, 0) },
      uColorCount: { value: 4 },
      uSeed: { value: 0 },
      uIntensity: { value: 1 },
      uScale: { value: 1 },
      uTime: { value: 0 }
    };

    return Object.assign(
      new ShaderMaterial({
        name: shaderKey || 'mantle-shader-background',
        vertexShader: VERTEX_SHADER,
        fragmentShader:
          fragmentShader ||
          `
          varying vec2 vUv;
          void main() {
            gl_FragColor = vec4(vec3(vUv, 0.0), 1.0);
          }
        `,
        depthTest: false,
        depthWrite: false,
        uniforms
      }),
      { uniforms }
    );
  }
}

let cachedRenderer: ThreeShaderBackgroundRenderer | undefined;
let webglUnavailable = false;

function getRenderer(): ThreeShaderBackgroundRenderer | undefined {
  if (webglUnavailable) return undefined;

  try {
    cachedRenderer ??= new ThreeShaderBackgroundRenderer();
    return cachedRenderer;
  } catch {
    webglUnavailable = true;
    return undefined;
  }
}

export function drawShaderBackground(input: ShaderBackgroundInput): boolean {
  const renderer = getRenderer();
  if (!renderer) return false;

  try {
    const shaderCanvas = renderer.render(input);
    input.ctx.drawImage(
      shaderCanvas,
      input.rect.x,
      input.rect.y,
      input.rect.width,
      input.rect.height
    );
    return true;
  } catch {
    return false;
  }
}
