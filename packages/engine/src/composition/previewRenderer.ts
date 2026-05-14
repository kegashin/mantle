import type {
  MantleFrame,
  MantleRenderableAsset,
  MantleText,
  MantleTextLayer
} from '@mantle/schemas/model';

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
import { isAnimatedBackgroundPresetId } from './backgrounds';
import type { MantleSceneLayout } from './renderer/sceneLayout';
import { resolveMantleSceneLayout } from './renderer/sceneLayout';
import {
  drawMantleBackground,
  drawMantleFrameScaffold,
  drawMantleFrameStroke,
  drawMantleFrameSurface,
  drawMantleSourceFrame,
  drawMantleText,
  type MantleFrameSurfaceRender
} from './renderer/sceneRender';
import type { Rect } from './types';

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
  render: (input: MantlePreviewRenderInput) => Promise<MantlePreviewRenderResult>;
  clear: () => void;
  dispose: () => void;
};

export type MantlePreviewRenderInput = MantleRenderInput & {
  renderFrameSurface?: boolean | undefined;
};

export type MantlePreviewRenderResult = {
  canvas: MantleCanvas;
  width: number;
  height: number;
  contentRect: Rect;
  contentRadius: number;
  contentCornerStyle: 'all' | 'bottom' | 'none';
  frameRect: Rect;
  baseFrameRect: Rect;
  frameRotation: number;
  textRect?: Rect | undefined;
  textRotation: number;
  textLayerRects: Array<Rect & { id: string; rotation: number }>;
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

function textRectFromLayout(layout: MantleSceneLayout): Rect | undefined {
  const textDraw = layout.textDraw;
  if (!textDraw) return undefined;
  return {
    x: textDraw.x,
    y: textDraw.y,
    width: textDraw.layout.width,
    height: textDraw.layout.height
  };
}

function textLayerRectsFromLayout(layout: MantleSceneLayout) {
  return layout.textLayerDraws.map((textDraw) => ({
    id: textDraw.layerId,
    x: textDraw.x,
    y: textDraw.y,
    width: textDraw.layout.width,
    height: textDraw.layout.height,
    rotation: textDraw.rotation
  }));
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
    gap: text.gap,
    transform: text.transform ?? null
  };
}

function textLayerGeometryKey(layer: MantleTextLayer) {
  return {
    id: layer.id,
    text: layer.text.trim(),
    font: layer.font,
    scale: layer.scale,
    width: layer.width,
    transform: layer.transform
  };
}

function frameLayoutKey(frame: MantleFrame) {
  return {
    preset: frame.preset,
    boxStyle: frame.boxStyle ?? null,
    padding: frame.padding,
    contentPadding: frame.contentPadding ?? null,
    cornerRadius: frame.cornerRadius
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
  input: MantlePreviewRenderInput,
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
    frameTransform: input.card.frameTransform ?? null,
    text: textGeometryKey(input.card.text),
    textLayers: input.card.textLayers?.map(textLayerGeometryKey) ?? []
  });
}

function createTextDrawKey(
  input: MantlePreviewRenderInput,
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
    textLayers: input.card.textLayers ?? [],
    hiddenTextLayerIds: input.hiddenTextLayerIds ?? [],
    palette: input.card.background.palette,
    backgroundPresetId: input.card.background.presetId
  });
}

function createBackgroundKey(
  input: MantlePreviewRenderInput,
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
        : null,
    timeMs: isAnimatedBackgroundPresetId(input.card.background.presetId)
      ? Math.round(input.timeMs ?? 0)
      : 0
  });
}

function createBaseKey({
  input,
  backgroundKey,
  layoutGeometryKey,
  width,
  height
}: {
  input: MantlePreviewRenderInput;
  backgroundKey: string;
  layoutGeometryKey: string;
  width: number;
  height: number;
}): string {
  const sourceAsset = assetRenderKey(input.asset);

  return stableKey({
    version: 1,
    width,
    height,
    backgroundKey,
    layoutGeometryKey,
    renderFrameSurface: input.renderFrameSurface ?? true,
    frame: input.card.frame,
    frameTransform: input.card.frameTransform ?? null,
    sourcePlacement: sourceAsset ? input.card.sourcePlacement ?? null : null,
    cardName: input.card.name,
    sourceAsset,
    showEmptyPlaceholderText: input.showEmptyPlaceholderText ?? true
  });
}

function createFrameScaffoldKey({
  input,
  backgroundKey,
  layoutGeometryKey,
  width,
  height
}: {
  input: MantlePreviewRenderInput;
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
    renderFrameSurface: input.renderFrameSurface ?? true,
    frame: input.card.frame,
    frameTransform: input.card.frameTransform ?? null,
    cardName: input.card.name
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
  input: MantlePreviewRenderInput;
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
  let cachedFrameSurface: MantleFrameSurfaceRender | undefined;
  let disposed = false;

  const clear = () => {
    clearLayer(backgroundLayer);
    clearLayer(baseLayer);
    cachedLayout = undefined;
    cachedFrameSurface = undefined;
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
            renderMode: input.renderMode ?? 'preview',
            timeMs: input.timeMs ?? 0
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
      const renderFrameSurface = input.renderFrameSurface ?? true;
      const hasRuntimeSourceFrame =
        renderFrameSurface &&
        input.asset?.mediaKind === 'video' &&
        input.sourceFrame != null;
      const frameScaffoldKey = hasRuntimeSourceFrame
        ? createFrameScaffoldKey({
            input,
            backgroundKey,
            layoutGeometryKey,
            width,
            height
          })
        : baseKey;

      if (baseLayer.key !== frameScaffoldKey) {
        const baseCtx = getCanvas2D(baseLayer.canvas);
        baseCtx.save();
        try {
          baseCtx.clearRect(0, 0, width, height);
          baseCtx.drawImage(backgroundLayer.canvas, 0, 0);
          cachedFrameSurface = renderFrameSurface
            ? hasRuntimeSourceFrame
              ? drawMantleFrameScaffold({
                  ctx: baseCtx,
                  card: input.card,
                  layout: cachedLayout.layout
                })
              : await drawMantleFrameSurface({
                  ctx: baseCtx,
                  card: input.card,
                  asset: input.asset,
                  sourceFrame: input.sourceFrame,
                  layout: cachedLayout.layout,
                  showEmptyPlaceholderText: input.showEmptyPlaceholderText ?? true
                })
            : undefined;
          baseLayer.key = frameScaffoldKey;
        } finally {
          baseCtx.restore();
        }
      }

      const fallbackFrameRect = renderFrameSurface
        ? cachedLayout.layout.imageRect
        : cachedLayout.layout.canvasRect;
      const fallbackBaseFrameRect = renderFrameSurface
        ? cachedLayout.layout.baseImageRect
        : cachedLayout.layout.canvasRect;
      const fallbackFrameRotation = renderFrameSurface
        ? cachedLayout.layout.frameRotation
        : 0;
      const contentRect = cachedFrameSurface?.contentRect ?? fallbackFrameRect;
      const contentRadius =
        cachedFrameSurface?.contentRadius ??
        (renderFrameSurface ? cachedLayout.layout.cornerRadius : 0);
      const contentCornerStyle = cachedFrameSurface?.contentCornerStyle ?? 'all';
      const frameRect = cachedFrameSurface?.frameRect ?? fallbackFrameRect;
      const baseFrameRect =
        cachedFrameSurface?.baseFrameRect ?? fallbackBaseFrameRect;
      const frameRotation =
        cachedFrameSurface?.frameRotation ?? fallbackFrameRotation;
      const textRect = textRectFromLayout(cachedLayout.layout);
      const textRotation = cachedLayout.layout.textDraw?.rotation ?? 0;
      const textLayerRects = textLayerRectsFromLayout(cachedLayout.layout);

      outputCtx.save();
      try {
        outputCtx.clearRect(0, 0, width, height);
        outputCtx.drawImage(baseLayer.canvas, 0, 0);
        if (hasRuntimeSourceFrame && input.sourceFrame) {
          drawMantleSourceFrame({
            ctx: outputCtx,
            card: input.card,
            sourceFrame: input.sourceFrame,
            frameSurface: {
              contentRect,
              contentRadius,
              contentCornerStyle
            },
            layout: cachedLayout.layout
          });
          drawMantleFrameStroke({
            ctx: outputCtx,
            card: input.card,
            frameSurface: {
              contentRect,
              contentRadius,
              contentCornerStyle
            },
            layout: cachedLayout.layout
          });
        }
        drawMantleText({
          ctx: outputCtx,
          layout: cachedLayout.layout,
          hiddenTextLayerIds: input.hiddenTextLayerIds
        });
      } finally {
        outputCtx.restore();
      }

      return {
        canvas: output,
        width,
        height,
        contentRect,
        contentRadius,
        contentCornerStyle,
        frameRect,
        baseFrameRect,
        frameRotation,
        textRect,
        textRotation,
        textLayerRects
      };
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
