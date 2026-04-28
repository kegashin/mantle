import type { MantleFrame, MantleRenderableAsset, MantleText } from '@mantle/schemas/model';

import {
  createCanvas,
  getCanvas2D,
  releaseScratchCanvas,
  resetCanvasBitmap,
  type MantleCanvas,
  type MantleCanvasRenderingContext2D
} from './canvas';
import type { MantleRenderInput } from './renderMantleCard';
import {
  resolveMantleRenderSize,
  validateMantleRenderBudget
} from './renderMantleCard';
import type { MantleSceneLayout } from './renderer/sceneLayout';
import { resolveMantleSceneLayout } from './renderer/sceneLayout';
import {
  drawMantleBackground,
  drawMantleFrameSurface,
  drawMantleText
} from './renderer/sceneRender';

type CachedLayer = {
  canvas: MantleCanvas;
  key: string | undefined;
  width: number;
  height: number;
};

type CachedLayout = {
  geometryKey: string;
  textDrawKey: string;
  layout: MantleSceneLayout;
};

export type MantlePreviewRenderer = {
  render: (input: MantleRenderInput) => Promise<MantleCanvas>;
  clear: () => void;
  dispose: () => void;
};

function ensureCanvas(input: MantleRenderInput, width: number, height: number): MantleCanvas {
  if (input.canvas) {
    if (input.canvas.width !== width) input.canvas.width = width;
    if (input.canvas.height !== height) input.canvas.height = height;
    return input.canvas;
  }
  return createCanvas(width, height);
}

function ensureLayer(
  layer: CachedLayer | undefined,
  width: number,
  height: number
): CachedLayer {
  if (!layer) {
    return {
      canvas: createCanvas(width, height),
      key: undefined,
      width,
      height
    };
  }

  if (layer.width !== width || layer.height !== height) {
    resetCanvasBitmap(layer.canvas, width, height);
    layer.key = undefined;
    layer.width = width;
    layer.height = height;
  }

  return layer;
}

function clearLayer(layer: CachedLayer | undefined): void {
  if (!layer) return;
  releaseScratchCanvas(layer.canvas);
  layer.key = undefined;
  layer.width = 1;
  layer.height = 1;
}

function assetRenderKey(asset: MantleRenderableAsset | undefined) {
  if (!asset) return null;
  return {
    id: asset.id,
    role: asset.role,
    name: asset.name,
    mimeType: asset.mimeType ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    fileSize: asset.fileSize ?? null,
    objectUrl: asset.objectUrl ?? null
  };
}

function assetLayoutKey(asset: MantleRenderableAsset | undefined) {
  if (!asset) return null;
  return {
    id: asset.id,
    width: asset.width ?? null,
    height: asset.height ?? null
  };
}

function textGeometryKey(text: MantleText) {
  if (text.placement === 'none') {
    return {
      placement: text.placement
    };
  }

  return {
    placement: text.placement,
    title: text.title?.trim() ?? '',
    subtitle: text.subtitle?.trim() ?? '',
    titleFont: text.titleFont,
    subtitleFont: text.subtitleFont,
    scale: text.scale,
    width: text.width,
    gap: text.gap
  };
}

function frameLayoutKey(frame: MantleFrame) {
  return {
    preset: frame.preset,
    boxStyle: frame.boxStyle ?? null,
    padding: frame.padding,
    contentPadding: frame.contentPadding ?? null
  };
}

function stableKey(value: unknown): string {
  return JSON.stringify(sortStable(value));
}

function sortStable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortStable);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortStable(entry)])
  );
}

function createLayoutGeometryKey(
  input: MantleRenderInput,
  width: number,
  height: number,
  scale: number
): string {
  return stableKey({
    version: 1,
    width,
    height,
    scale,
    asset: assetLayoutKey(input.asset),
    frame: frameLayoutKey(input.card.frame),
    text: textGeometryKey(input.card.text)
  });
}

function createTextDrawKey(
  input: MantleRenderInput,
  layoutGeometryKey: string,
  width: number,
  height: number
): string {
  return stableKey({
    version: 1,
    width,
    height,
    layoutGeometryKey,
    text: input.card.text,
    palette: input.card.background.palette,
    backgroundPresetId: input.card.background.presetId
  });
}

function createBackgroundKey(
  input: MantleRenderInput,
  width: number,
  height: number,
  scale: number
): string {
  return stableKey({
    version: 1,
    width,
    height,
    scale,
    renderMode: input.renderMode ?? 'preview',
    background: input.card.background,
    backgroundAsset:
      input.card.background.presetId === 'image-fill'
        ? assetRenderKey(input.backgroundAsset)
        : null
  });
}

function createBaseKey({
  input,
  backgroundKey,
  layoutGeometryKey,
  width,
  height
}: {
  input: MantleRenderInput;
  backgroundKey: string;
  layoutGeometryKey: string;
  width: number;
  height: number;
}): string {
  return stableKey({
    version: 1,
    width,
    height,
    backgroundKey,
    layoutGeometryKey,
    frame: input.card.frame,
    cardName: input.card.name,
    sourceAsset: assetRenderKey(input.asset),
    showEmptyPlaceholderText: input.showEmptyPlaceholderText ?? true
  });
}

function resolveCachedLayout({
  cachedLayout,
  ctx,
  input,
  width,
  height,
  scale,
  layoutGeometryKey,
  textDrawKey
}: {
  cachedLayout: CachedLayout | undefined;
  ctx: MantleCanvasRenderingContext2D;
  input: MantleRenderInput;
  width: number;
  height: number;
  scale: number;
  layoutGeometryKey: string;
  textDrawKey: string;
}): CachedLayout {
  if (
    cachedLayout &&
    cachedLayout.geometryKey === layoutGeometryKey &&
    cachedLayout.textDrawKey === textDrawKey
  ) {
    return cachedLayout;
  }

  ctx.save();
  try {
    return {
      geometryKey: layoutGeometryKey,
      textDrawKey,
      layout: resolveMantleSceneLayout({
        ctx,
        card: input.card,
        asset: input.asset,
        width,
        height,
        scale
      })
    };
  } finally {
    ctx.restore();
  }
}

export function createMantlePreviewRenderer(): MantlePreviewRenderer {
  let backgroundLayer: CachedLayer | undefined;
  let baseLayer: CachedLayer | undefined;
  let cachedLayout: CachedLayout | undefined;
  let disposed = false;

  const clear = () => {
    clearLayer(backgroundLayer);
    clearLayer(baseLayer);
    cachedLayout = undefined;
  };

  return {
    async render(input) {
      if (disposed) {
        throw new Error('Preview renderer is disposed.');
      }

      const { scale, width, height } = resolveMantleRenderSize(
        input.target,
        input.scale ?? 1
      );
      validateMantleRenderBudget(input.card, width, height);

      const output = ensureCanvas(input, width, height);
      const outputCtx = getCanvas2D(output);
      const layoutGeometryKey = createLayoutGeometryKey(input, width, height, scale);
      const textDrawKey = createTextDrawKey(input, layoutGeometryKey, width, height);
      cachedLayout = resolveCachedLayout({
        cachedLayout,
        ctx: outputCtx,
        input,
        width,
        height,
        scale,
        layoutGeometryKey,
        textDrawKey
      });

      backgroundLayer = ensureLayer(backgroundLayer, width, height);
      baseLayer = ensureLayer(baseLayer, width, height);

      const backgroundKey = createBackgroundKey(input, width, height, scale);
      if (backgroundLayer.key !== backgroundKey) {
        const backgroundCtx = getCanvas2D(backgroundLayer.canvas);
        backgroundCtx.save();
        try {
          backgroundCtx.clearRect(0, 0, width, height);
          await drawMantleBackground({
            ctx: backgroundCtx,
            card: input.card,
            backgroundAsset: input.backgroundAsset,
            layout: cachedLayout.layout,
            renderMode: input.renderMode ?? 'preview'
          });
          backgroundLayer.key = backgroundKey;
        } finally {
          backgroundCtx.restore();
        }
      }

      const baseKey = createBaseKey({
        input,
        backgroundKey,
        layoutGeometryKey,
        width,
        height
      });
      if (baseLayer.key !== baseKey) {
        const baseCtx = getCanvas2D(baseLayer.canvas);
        baseCtx.save();
        try {
          baseCtx.clearRect(0, 0, width, height);
          baseCtx.drawImage(backgroundLayer.canvas, 0, 0);
          await drawMantleFrameSurface({
            ctx: baseCtx,
            card: input.card,
            asset: input.asset,
            layout: cachedLayout.layout,
            showEmptyPlaceholderText: input.showEmptyPlaceholderText ?? true
          });
          baseLayer.key = baseKey;
        } finally {
          baseCtx.restore();
        }
      }

      outputCtx.save();
      try {
        outputCtx.clearRect(0, 0, width, height);
        outputCtx.drawImage(baseLayer.canvas, 0, 0);
        drawMantleText({
          ctx: outputCtx,
          layout: cachedLayout.layout
        });
      } finally {
        outputCtx.restore();
      }

      return output;
    },
    clear,
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      backgroundLayer = undefined;
      baseLayer = undefined;
    }
  };
}
