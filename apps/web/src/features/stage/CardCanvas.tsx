import {
  createMantlePreviewRenderer,
  SOURCE_PLACEMENT_ZOOM_MAX,
  SOURCE_PLACEMENT_ZOOM_MIN,
  resolveCoverSourceCrop,
  resolveSourceCropFocus,
  resolveSourceCropForContent,
  resolveSourceCropZoom
} from '@mantle/engine/render';
import type {
  MantlePreviewRenderer,
  MantleRuntimeFrameSource
} from '@mantle/engine/render';
import type {
  MantleCard,
  MantleFrameTransform,
  MantleRenderableAsset,
  MantleSourceCrop,
  MantleSourcePlacement,
  MantleSurfaceTarget,
  MantleTextLayer,
  MantleTextTransform
} from '@mantle/schemas/model';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from 'react';

import { Icon } from '../../components/Icon';
import styles from './CardCanvas.module.css';
import type {
  PreviewRenderRequestPayload as PreviewWorkerRequest,
  PreviewRenderResponse as PreviewWorkerResponse,
  PreviewRenderResult as PreviewWorkerResult
} from './previewRenderProtocol';

const PREVIEW_MAX_PIXEL_COUNT = 16_000_000;
const PREVIEW_WORKER_PIXEL_THRESHOLD = 900_000;
const PREVIEW_MIN_RENDER_INTERVAL_MS = 1000 / 30;
const FRAME_SCALE_MIN = 0.35;
const FRAME_SCALE_MAX = 2.5;
const FRAME_SNAP_DISTANCE_PX = 6;
const STAGE_ACTIONS_ESTIMATED_WIDTH = 132;
const STAGE_ACTIONS_ESTIMATED_HEIGHT = 40;
const STAGE_ACTIONS_STAGE_INSET = 12;
const STAGE_ACTIONS_AVOID_GAP = 10;
const FRAME_TOOLBAR_ESTIMATED_WIDTH = 132;
const FRAME_TOOLBAR_ESTIMATED_HEIGHT = 42;
const FRAME_TOOLBAR_STAGE_INSET = 12;
const TEXT_TOOLBAR_ESTIMATED_WIDTH = 132;
const TEXT_TOOLBAR_ESTIMATED_HEIGHT = 42;
const TEXT_TOOLBAR_STAGE_INSET = 12;
const TEXT_WIDTH_MIN = 0.08;
const TEXT_WIDTH_MAX = 1;
const TEXT_SCALE_MIN = 0.5;
const TEXT_SCALE_MAX = 2;
const FRAME_ROTATION_SNAP_DEGREES = 2;
const FRAME_ROTATION_SNAP_ANCHORS = [
  -180,
  -135,
  -90,
  -45,
  -30,
  -15,
  0,
  15,
  30,
  45,
  90,
  135,
  180
] as const;
const HEAVY_PREVIEW_BACKGROUND_IDS = new Set([
  'symbol-wave',
  'aurora-gradient',
  'contour-lines',
  'falling-pattern',
  'marbling',
  'signal-field',
  'smoke-veil'
]);
const ANIMATED_PREVIEW_BACKGROUND_IDS = new Set([
  'aurora-gradient',
  'marbling',
  'smoke-veil'
]);

export type VideoPlaybackState = {
  currentTimeMs: number;
  durationMs: number;
  paused: boolean;
  muted: boolean;
};

export type VideoClipRange = {
  startMs: number;
  endMs: number;
  loop: boolean;
};

export type VideoPlaybackCommand =
  | { id: number; type: 'toggle-playback' }
  | { id: number; type: 'seek'; timeMs: number }
  | { id: number; type: 'toggle-muted' };

export type VideoPlaybackCommandInput =
  | { type: 'toggle-playback' }
  | { type: 'seek'; timeMs: number }
  | { type: 'toggle-muted' };

type CardCanvasProps = {
  card: MantleCard;
  target: MantleSurfaceTarget;
  asset?: MantleRenderableAsset | undefined;
  backgroundAsset?: MantleRenderableAsset | undefined;
  motionPreviewActive?: boolean | undefined;
  backgroundAnimationEnabled?: boolean | undefined;
  videoClip?: VideoClipRange | undefined;
  videoPlaybackCommand?: VideoPlaybackCommand | undefined;
  onChooseSource?: () => void;
  onRelinkSource?: () => void;
  onSourcePlacementChange?: (placement: MantleSourcePlacement) => void;
  onFrameTransformChange?: (transform: MantleFrameTransform) => void;
  onTextChange?: (patch: Partial<MantleCard['text']>) => void;
  onTextLayerChange?: (layerId: string, patch: Partial<MantleTextLayer>) => void;
  onActiveTextLayerChange?: (layerId: string | undefined) => void;
  onVideoPlaybackStateChange?: (state: VideoPlaybackState) => void;
};

type PreviewRenderState = {
  card: MantleCard;
  target: MantleSurfaceTarget;
  asset?: MantleRenderableAsset | undefined;
  backgroundAsset?: MantleRenderableAsset | undefined;
  hasAssetSource: boolean;
  hiddenTextLayerIds?: string[] | undefined;
};

type PreviewWorkerJob = {
  id: number;
  request: PreviewWorkerRequest;
  resolve: (result: PreviewWorkerResult) => void;
  reject: (error: Error) => void;
};

type PreviewWorkerClient = {
  render: (request: PreviewWorkerRequest) => Promise<PreviewWorkerResult>;
  dispose: () => void;
};

type RequestVideoFrameMetadata = {
  mediaTime: number;
  width?: number | undefined;
  height?: number | undefined;
};

type RequestVideoFrameCallback = (
  now: number,
  metadata: RequestVideoFrameMetadata
) => void;

type RequestVideoFrameElement = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: RequestVideoFrameCallback) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

type StageRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PreviewSurface = {
  canvasWidth: number;
  canvasHeight: number;
  canvasCssRect: StageRect;
  contentRect: StageRect;
  contentCssRect: StageRect;
  contentRadius: number;
  contentCornerStyle: 'all' | 'bottom' | 'none';
  frameRect: StageRect;
  frameCssRect: StageRect;
  baseFrameRect: StageRect;
  baseFrameCssRect: StageRect;
  frameRotation: number;
  textRect?: StageRect | undefined;
  textCssRect?: StageRect | undefined;
  textRotation: number;
  textLayerRects: Array<StageRect & { id: string; rotation: number }>;
  textLayerCssRects: Array<StageRect & { id: string; rotation: number }>;
};

type SourceDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  crop: MantleSourceCrop;
};

type FrameResizeHandle = 'n' | 'e' | 's' | 'w' | 'nw' | 'ne' | 'sw' | 'se';
type FrameDragMode = 'move' | 'resize' | 'rotate';
type TextResizeHandle = 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';
type TextDragMode = 'move' | 'resize' | 'rotate';

type FrameDragState = {
  pointerId: number;
  mode: FrameDragMode;
  handle?: FrameResizeHandle | undefined;
  startX: number;
  startY: number;
  transform: MantleFrameTransform;
  startAngle: number;
};

type FrameSnapGuide = {
  axis: 'x' | 'y';
  position: number;
};

type TextDraftState = {
  rect: StageRect;
  transform: MantleTextTransform;
  width: number;
  scale: number;
};

type TextDragState = {
  pointerId: number;
  mode: TextDragMode;
  handle?: TextResizeHandle | undefined;
  startX: number;
  startY: number;
  rect: StageRect;
  transform: MantleTextTransform;
  width: number;
  scale: number;
  startAngle: number;
};

class PreviewRenderCancelledError extends Error {
  override name = 'PreviewRenderCancelledError';
}

class PreviewWorkerRenderError extends Error {
  override name = 'PreviewWorkerRenderError';
}

function isPreviewRenderCancelled(
  error: Error
): error is PreviewRenderCancelledError {
  return error instanceof PreviewRenderCancelledError;
}

function isPreviewWorkerRenderError(error: Error): error is PreviewWorkerRenderError {
  return error instanceof PreviewWorkerRenderError;
}

function toPreviewRenderFailure(error: unknown): Error {
  return error instanceof Error ? error : new Error('Render failed.');
}

function resolveStablePreviewScale(target: MantleSurfaceTarget): number {
  const pixelCapScale = Math.sqrt(
    PREVIEW_MAX_PIXEL_COUNT / Math.max(1, target.width * target.height)
  );
  return Math.max(0.1, Math.min(1, pixelCapScale));
}

function canUsePreviewWorker(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap !== 'undefined'
  );
}

function shouldUsePreviewWorker(
  card: MantleCard,
  target: MantleSurfaceTarget,
  scale: number
): boolean {
  const renderPixels = target.width * target.height * scale * scale;
  return (
    canUsePreviewWorker() &&
    (renderPixels >= PREVIEW_WORKER_PIXEL_THRESHOLD ||
      card.frame.boxStyle === 'glass-panel' ||
      HEAVY_PREVIEW_BACKGROUND_IDS.has(card.background.presetId))
  );
}

function releasePreviewBufferCanvas(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  canvas.width = 1;
  canvas.height = 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampToRange(value: number, min: number, max: number): number {
  if (max < min) return (min + max) / 2;
  return clamp(value, min, max);
}

function normalizeCrop(crop: MantleSourceCrop): MantleSourceCrop {
  const width = clamp(crop.width, 0.01, 1);
  const height = clamp(crop.height, 0.01, 1);
  return {
    x: clamp(crop.x, 0, 1 - width),
    y: clamp(crop.y, 0, 1 - height),
    width,
    height
  };
}

function normalizeRotation(rotation: number): number {
  const normalized = ((((rotation + 180) % 360) + 360) % 360) - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function snapFrameRotation(rotation: number): {
  rotation: number;
  anchor: number | null;
} {
  const normalized = normalizeRotation(rotation);
  let best: { anchor: number; distance: number } | null = null;

  for (const anchor of FRAME_ROTATION_SNAP_ANCHORS) {
    const distance = Math.abs(normalizeRotation(normalized - anchor));
    if (distance > FRAME_ROTATION_SNAP_DEGREES) continue;
    if (best && distance >= best.distance) continue;
    best = { anchor, distance };
  }

  return best
    ? { rotation: normalizeRotation(best.anchor), anchor: normalizeRotation(best.anchor) }
    : { rotation: normalized, anchor: null };
}

function formatRotationAngle(rotation: number): string {
  const rounded = Math.round(normalizeRotation(rotation));
  const display = Math.abs(rounded) === 180 ? 180 : rounded;
  return `${display}°`;
}

function normalizeFrameTransform(
  transform: MantleFrameTransform | undefined
): MantleFrameTransform {
  return {
    x: clamp(transform?.x ?? 0, -1, 1),
    y: clamp(transform?.y ?? 0, -1, 1),
    scaleX: clamp(transform?.scaleX ?? 1, FRAME_SCALE_MIN, FRAME_SCALE_MAX),
    scaleY: clamp(transform?.scaleY ?? 1, FRAME_SCALE_MIN, FRAME_SCALE_MAX),
    rotation: normalizeRotation(transform?.rotation ?? 0)
  };
}

function normalizeTextTransform(
  transform: MantleTextTransform | undefined
): MantleTextTransform {
  return {
    x: clamp(transform?.x ?? 0.5, -1, 2),
    y: clamp(transform?.y ?? 0.5, -1, 2),
    rotation: normalizeRotation(transform?.rotation ?? 0)
  };
}

function resolveEditorTextFontStack(font: MantleTextLayer['font']): string {
  switch (font) {
    case 'system':
      return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    case 'display':
      return '"Fraunces Variable", "Fraunces", "New York", "Iowan Old Style", Georgia, serif';
    case 'rounded':
      return '"Nunito Variable", "Nunito", ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
    case 'serif':
      return 'ui-serif, Georgia, "Times New Roman", serif';
    case 'editorial':
      return '"Instrument Serif", "New York", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
    case 'slab':
      return '"Roboto Slab Variable", "Roboto Slab", Rockwell, "Courier New", ui-serif, serif';
    case 'mono':
      return '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    case 'code':
      return '"JetBrains Mono", "SF Mono", "Cascadia Code", "Fira Code", ui-monospace, monospace';
    case 'condensed':
      return '"Arial Narrow", "Helvetica Neue Condensed", "Roboto Condensed", Arial, sans-serif';
    case 'sans':
    default:
      return '"Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  }
}

function resolveEditorLetterSpacingPx(
  font: MantleTextLayer['font'],
  fontSize: number
): number {
  if (font === 'mono' || font === 'code') return fontSize * 0.005;
  if (font === 'condensed') return fontSize * 0.012;
  const norm = Math.min(1, Math.max(0, (fontSize - 24) / 80));
  return fontSize * (-0.012 - norm * 0.012);
}

function textTransformFromCssRect({
  rect,
  canvasRect,
  rotation
}: {
  rect: StageRect;
  canvasRect: StageRect;
  rotation: number;
}): MantleTextTransform {
  return normalizeTextTransform({
    x: (rect.x + rect.width / 2 - canvasRect.x) / Math.max(1, canvasRect.width),
    y: (rect.y + rect.height / 2 - canvasRect.y) / Math.max(1, canvasRect.height),
    rotation
  });
}

function textCssRectFromDraft(draft: TextDraftState | null): StageRect | undefined {
  return draft?.rect;
}

function textHotspotStyle({
  rect,
  rotation
}: {
  rect: StageRect;
  rotation: number;
}): CSSProperties {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    transform: `rotate(${rotation}deg)`,
    '--stage-hotspot-counter-rotation': `${-rotation}deg`
  } as CSSProperties;
}

function applyFrameTransformToCssRect({
  rect,
  canvasRect,
  transform
}: {
  rect: StageRect;
  canvasRect: StageRect;
  transform: MantleFrameTransform;
}): StageRect {
  const width = rect.width * transform.scaleX;
  const height = rect.height * transform.scaleY;

  return {
    x: rect.x + (rect.width - width) / 2 + transform.x * canvasRect.width,
    y: rect.y + (rect.height - height) / 2 + transform.y * canvasRect.height,
    width,
    height
  };
}

function snapRectToCanvas({
  rect,
  canvasRect,
  includeEdges
}: {
  rect: StageRect;
  canvasRect: StageRect;
  includeEdges: boolean;
}): { rect: StageRect; guides: FrameSnapGuide[] } {
  const rectCenterX = rect.x + rect.width / 2;
  const rectCenterY = rect.y + rect.height / 2;
  const canvasCenterX = canvasRect.x + canvasRect.width / 2;
  const canvasCenterY = canvasRect.y + canvasRect.height / 2;
  const xSources = includeEdges
    ? [rect.x, rectCenterX, rect.x + rect.width]
    : [rectCenterX];
  const ySources = includeEdges
    ? [rect.y, rectCenterY, rect.y + rect.height]
    : [rectCenterY];
  const xTargets = includeEdges
    ? [canvasRect.x, canvasCenterX, canvasRect.x + canvasRect.width]
    : [canvasCenterX];
  const yTargets = includeEdges
    ? [canvasRect.y, canvasCenterY, canvasRect.y + canvasRect.height]
    : [canvasCenterY];
  const xSnap = findNearestSnap({ sources: xSources, targets: xTargets });
  const ySnap = findNearestSnap({ sources: ySources, targets: yTargets });

  if (!xSnap && !ySnap) return { rect, guides: [] };

  return {
    rect: {
      ...rect,
      x: rect.x + (xSnap?.delta ?? 0),
      y: rect.y + (ySnap?.delta ?? 0)
    },
    guides: [
      ...(xSnap ? [{ axis: 'x' as const, position: xSnap.position }] : []),
      ...(ySnap ? [{ axis: 'y' as const, position: ySnap.position }] : [])
    ]
  };
}

function frameTransformAngle(
  event: Pick<PointerEvent, 'clientX' | 'clientY'>,
  frameRect: StageRect
): number {
  const centerX = frameRect.x + frameRect.width / 2;
  const centerY = frameRect.y + frameRect.height / 2;
  return Math.atan2(event.clientY - centerY, event.clientX - centerX);
}

function rotatedBounds(rect: StageRect, rotation: number): StageRect {
  return rotatedBoundsAround(rect, rotation, {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  });
}

function rotatePointAround(
  point: { x: number; y: number },
  origin: { x: number; y: number },
  rotation: number
): { x: number; y: number } {
  if (rotation === 0) return point;

  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;

  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos
  };
}

function rotatedBoundsAround(
  rect: StageRect,
  rotation: number,
  origin: { x: number; y: number }
): StageRect {
  if (rotation === 0) return rect;

  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x, y: rect.y + rect.height },
    { x: rect.x + rect.width, y: rect.y + rect.height }
  ].map((point) => rotatePointAround(point, origin, rotation));
  const minX = Math.min(...corners.map((point) => point.x));
  const maxX = Math.max(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxY = Math.max(...corners.map((point) => point.y));
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function expandedRect(rect: StageRect, inset: number): StageRect {
  return {
    x: rect.x - inset,
    y: rect.y - inset,
    width: rect.width + inset * 2,
    height: rect.height + inset * 2
  };
}

function stageRectFromCenter({
  center,
  width,
  height
}: {
  center: { x: number; y: number };
  width: number;
  height: number;
}): StageRect {
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height
  };
}

function stageRectsOverlap(left: StageRect, right: StageRect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function resolveStageActionsTarget({
  preferred,
  canvasRect,
  avoidRects
}: {
  preferred: { x: number; y: number };
  canvasRect: StageRect;
  avoidRects: StageRect[];
}): { x: number; y: number } {
  const minX =
    canvasRect.x + STAGE_ACTIONS_STAGE_INSET + STAGE_ACTIONS_ESTIMATED_WIDTH / 2;
  const maxX =
    canvasRect.x +
    canvasRect.width -
    STAGE_ACTIONS_STAGE_INSET -
    STAGE_ACTIONS_ESTIMATED_WIDTH / 2;
  const minY =
    canvasRect.y + STAGE_ACTIONS_STAGE_INSET + STAGE_ACTIONS_ESTIMATED_HEIGHT / 2;
  const maxY =
    canvasRect.y +
    canvasRect.height -
    STAGE_ACTIONS_STAGE_INSET -
    STAGE_ACTIONS_ESTIMATED_HEIGHT / 2;
  const clampTarget = (target: { x: number; y: number }) => ({
    x: clampToRange(target.x, minX, maxX),
    y: clampToRange(target.y, minY, maxY)
  });
  const actionOverlapsText = (target: { x: number; y: number }) => {
    const actionRect = stageRectFromCenter({
      center: target,
      width: STAGE_ACTIONS_ESTIMATED_WIDTH,
      height: STAGE_ACTIONS_ESTIMATED_HEIGHT
    });
    return avoidRects.some((rect) =>
      stageRectsOverlap(actionRect, expandedRect(rect, STAGE_ACTIONS_AVOID_GAP))
    );
  };
  const preferredTarget = clampTarget(preferred);

  if (!actionOverlapsText(preferredTarget)) return preferredTarget;

  const candidates = avoidRects.flatMap((rect) => {
    const expanded = expandedRect(rect, STAGE_ACTIONS_AVOID_GAP);
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    return [
      {
        x: preferredTarget.x,
        y: expanded.y - STAGE_ACTIONS_ESTIMATED_HEIGHT / 2
      },
      {
        x: preferredTarget.x,
        y: expanded.y + expanded.height + STAGE_ACTIONS_ESTIMATED_HEIGHT / 2
      },
      {
        x: expanded.x - STAGE_ACTIONS_ESTIMATED_WIDTH / 2,
        y: centerY
      },
      {
        x: expanded.x + expanded.width + STAGE_ACTIONS_ESTIMATED_WIDTH / 2,
        y: centerY
      },
      {
        x: centerX,
        y: expanded.y - STAGE_ACTIONS_ESTIMATED_HEIGHT / 2
      },
      {
        x: centerX,
        y: expanded.y + expanded.height + STAGE_ACTIONS_ESTIMATED_HEIGHT / 2
      }
    ];
  });

  return (
    candidates
      .map(clampTarget)
      .filter((target) => !actionOverlapsText(target))
      .sort((left, right) => {
        const leftDistance = Math.hypot(left.x - preferred.x, left.y - preferred.y);
        const rightDistance = Math.hypot(right.x - preferred.x, right.y - preferred.y);
        return leftDistance - rightDistance;
      })[0] ?? preferredTarget
  );
}

function findNearestSnap({
  sources,
  targets
}: {
  sources: number[];
  targets: number[];
}): { delta: number; position: number } | null {
  let best: { delta: number; position: number; distance: number } | null = null;

  for (const source of sources) {
    for (const target of targets) {
      const delta = target - source;
      const distance = Math.abs(delta);
      if (distance > FRAME_SNAP_DISTANCE_PX) continue;
      if (best && distance >= best.distance) continue;
      best = { delta, position: target, distance };
    }
  }

  return best ? { delta: best.delta, position: best.position } : null;
}

function snapFrameTransformToSurface({
  transform,
  surface,
  includeEdges
}: {
  transform: MantleFrameTransform;
  surface: PreviewSurface | null;
  includeEdges: boolean;
}): { transform: MantleFrameTransform; guides: FrameSnapGuide[] } {
  const normalized = normalizeFrameTransform(transform);
  if (!surface) return { transform: normalized, guides: [] };

  const rect = applyFrameTransformToCssRect({
    rect: surface.baseFrameCssRect,
    canvasRect: surface.canvasCssRect,
    transform: normalized
  });
  const bounds = rotatedBounds(rect, normalized.rotation);
  const canvas = surface.canvasCssRect;
  const frameCenterX = bounds.x + bounds.width / 2;
  const frameCenterY = bounds.y + bounds.height / 2;
  const canvasCenterX = canvas.x + canvas.width / 2;
  const canvasCenterY = canvas.y + canvas.height / 2;
  const xSources = includeEdges
    ? [bounds.x, frameCenterX, bounds.x + bounds.width]
    : [frameCenterX];
  const ySources = includeEdges
    ? [bounds.y, frameCenterY, bounds.y + bounds.height]
    : [frameCenterY];
  const xTargets = includeEdges
    ? [canvas.x, canvasCenterX, canvas.x + canvas.width]
    : [canvasCenterX];
  const yTargets = includeEdges
    ? [canvas.y, canvasCenterY, canvas.y + canvas.height]
    : [canvasCenterY];
  const xSnap = findNearestSnap({ sources: xSources, targets: xTargets });
  const ySnap = findNearestSnap({ sources: ySources, targets: yTargets });

  if (!xSnap && !ySnap) return { transform: normalized, guides: [] };

  return {
    transform: normalizeFrameTransform({
      ...normalized,
      x: normalized.x + (xSnap?.delta ?? 0) / Math.max(1, canvas.width),
      y: normalized.y + (ySnap?.delta ?? 0) / Math.max(1, canvas.height)
    }),
    guides: [
      ...(xSnap ? [{ axis: 'x' as const, position: xSnap.position }] : []),
      ...(ySnap ? [{ axis: 'y' as const, position: ySnap.position }] : [])
    ]
  };
}

function stageActionsStyle({
  contentRect,
  frameRect,
  canvasRect,
  rotation,
  avoidRects = []
}: {
  contentRect: StageRect;
  frameRect: StageRect;
  canvasRect: StageRect;
  rotation: number;
  avoidRects?: StageRect[] | undefined;
}): CSSProperties {
  const origin = {
    x: frameRect.x + frameRect.width / 2,
    y: frameRect.y + frameRect.height / 2
  };
  const bounds = rotatedBoundsAround(contentRect, rotation, origin);
  const target = resolveStageActionsTarget({
    preferred: {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2
    },
    canvasRect,
    avoidRects
  });
  const localTarget = rotatePointAround(target, origin, -rotation);

  return {
    left: `${localTarget.x - contentRect.x}px`,
    top: `${localTarget.y - contentRect.y}px`,
    '--stage-hotspot-counter-rotation': `${-rotation}deg`
  } as CSSProperties;
}

function frameToolbarStyle({
  frameRect,
  canvasRect,
  rotation
}: {
  frameRect: StageRect;
  canvasRect: StageRect;
  rotation: number;
}): CSSProperties {
  const bounds = rotatedBounds(frameRect, rotation);
  const left = clampToRange(
    bounds.x + bounds.width / 2,
    canvasRect.x + FRAME_TOOLBAR_STAGE_INSET + FRAME_TOOLBAR_ESTIMATED_WIDTH / 2,
    canvasRect.x + canvasRect.width - FRAME_TOOLBAR_STAGE_INSET - FRAME_TOOLBAR_ESTIMATED_WIDTH / 2
  );
  const top = clampToRange(
    bounds.y + FRAME_TOOLBAR_STAGE_INSET,
    canvasRect.y + FRAME_TOOLBAR_STAGE_INSET,
    canvasRect.y + canvasRect.height - FRAME_TOOLBAR_STAGE_INSET - FRAME_TOOLBAR_ESTIMATED_HEIGHT
  );

  return {
    left: `${left}px`,
    top: `${top}px`
  };
}

function textToolbarStyle({
  textRect,
  canvasRect
}: {
  textRect: StageRect;
  canvasRect: StageRect;
}): CSSProperties {
  const gap = 10;
  const left = clampToRange(
    textRect.x + textRect.width / 2,
    canvasRect.x + TEXT_TOOLBAR_STAGE_INSET + TEXT_TOOLBAR_ESTIMATED_WIDTH / 2,
    canvasRect.x + canvasRect.width - TEXT_TOOLBAR_STAGE_INSET - TEXT_TOOLBAR_ESTIMATED_WIDTH / 2
  );
  const topAbove = textRect.y - TEXT_TOOLBAR_ESTIMATED_HEIGHT - gap;
  const topBelow = textRect.y + textRect.height + gap;
  const hasRoomAbove = topAbove >= canvasRect.y + TEXT_TOOLBAR_STAGE_INSET;
  const top = clampToRange(
    hasRoomAbove ? topAbove : topBelow,
    canvasRect.y + TEXT_TOOLBAR_STAGE_INSET,
    canvasRect.y + canvasRect.height - TEXT_TOOLBAR_STAGE_INSET - TEXT_TOOLBAR_ESTIMATED_HEIGHT
  );

  return {
    left: `${left}px`,
    top: `${top}px`
  };
}

function localFrameDelta({
  deltaX,
  deltaY,
  rotation
}: {
  deltaX: number;
  deltaY: number;
  rotation: number;
}): { x: number; y: number } {
  const radians = (-rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: deltaX * cos - deltaY * sin,
    y: deltaX * sin + deltaY * cos
  };
}

function textTransformAngle(
  event: Pick<PointerEvent, 'clientX' | 'clientY'>,
  textRect: StageRect
): number {
  const centerX = textRect.x + textRect.width / 2;
  const centerY = textRect.y + textRect.height / 2;
  return Math.atan2(event.clientY - centerY, event.clientX - centerX);
}

function resizeHandleDirections(handle: FrameResizeHandle): {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
} {
  return {
    x: handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0,
    y: handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0
  };
}

function isCornerResizeHandle(handle: FrameResizeHandle): boolean {
  const direction = resizeHandleDirections(handle);
  return direction.x !== 0 && direction.y !== 0;
}

function resolveEditableCrop(
  placement: MantleSourcePlacement | undefined,
  asset: MantleRenderableAsset | undefined,
  surface: PreviewSurface | null
): MantleSourceCrop {
  return resolveSourceCropForContent({
    placement,
    sourceWidth: asset?.width ?? 16,
    sourceHeight: asset?.height ?? 9,
    destinationWidth: surface?.contentRect.width ?? 16,
    destinationHeight: surface?.contentRect.height ?? 9
  });
}

function resizeCropAroundCenter(
  crop: MantleSourceCrop,
  coverCrop: MantleSourceCrop,
  zoom: number
): MantleSourceCrop {
  const nextZoom = clamp(
    zoom,
    SOURCE_PLACEMENT_ZOOM_MIN,
    SOURCE_PLACEMENT_ZOOM_MAX
  );
  const width = clamp(coverCrop.width / nextZoom, 0.01, coverCrop.width);
  const height = clamp(coverCrop.height / nextZoom, 0.01, coverCrop.height);
  const centerX = crop.x + crop.width / 2;
  const centerY = crop.y + crop.height / 2;

  return normalizeCrop({
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height
  });
}

function resizeCropAroundAnchor({
  crop,
  coverCrop,
  zoom,
  anchorX,
  anchorY
}: {
  crop: MantleSourceCrop;
  coverCrop: MantleSourceCrop;
  zoom: number;
  anchorX: number;
  anchorY: number;
}): MantleSourceCrop {
  const nextZoom = clamp(
    zoom,
    SOURCE_PLACEMENT_ZOOM_MIN,
    SOURCE_PLACEMENT_ZOOM_MAX
  );
  const width = clamp(coverCrop.width / nextZoom, 0.01, coverCrop.width);
  const height = clamp(coverCrop.height / nextZoom, 0.01, coverCrop.height);
  const pinnedSourceX = crop.x + anchorX * crop.width;
  const pinnedSourceY = crop.y + anchorY * crop.height;

  return normalizeCrop({
    x: pinnedSourceX - anchorX * width,
    y: pinnedSourceY - anchorY * height,
    width,
    height
  });
}

function centerCrop(crop: MantleSourceCrop): MantleSourceCrop {
  return normalizeCrop({
    ...crop,
    x: (1 - crop.width) / 2,
    y: (1 - crop.height) / 2
  });
}

function moveCropByContentDelta(
  crop: MantleSourceCrop,
  deltaX: number,
  deltaY: number,
  contentRect: StageRect
): MantleSourceCrop {
  return normalizeCrop({
    ...crop,
    x: crop.x - (deltaX / Math.max(1, contentRect.width)) * crop.width,
    y: crop.y - (deltaY / Math.max(1, contentRect.height)) * crop.height
  });
}

function sourcePreviewImageStyle(
  crop: MantleSourceCrop,
  contentRect: StageRect
): CSSProperties {
  const width = contentRect.width / crop.width;
  const height = contentRect.height / crop.height;

  return {
    width: `${width}px`,
    height: `${height}px`,
    transform: `translate(${-crop.x * width}px, ${-crop.y * height}px)`
  };
}

function sourceImageRectForCrop(
  crop: MantleSourceCrop,
  contentRect: StageRect
): StageRect {
  const width = contentRect.width / crop.width;
  const height = contentRect.height / crop.height;

  return {
    x: -crop.x * width,
    y: -crop.y * height,
    width,
    height
  };
}

function resolveVideoRuntimeFrameSource(
  asset: MantleRenderableAsset | undefined,
  video: HTMLVideoElement | null
): MantleRuntimeFrameSource | undefined {
  if (!asset || asset.mediaKind !== 'video' || !video) return undefined;
  if (video.readyState < 2) return undefined;

  const width = video.videoWidth || asset.width || 0;
  const height = video.videoHeight || asset.height || 0;
  if (width <= 0 || height <= 0) return undefined;

  const timeMs = Number.isFinite(video.currentTime) ? video.currentTime * 1000 : 0;
  return {
    source: video,
    width,
    height,
    timeMs,
    cacheKey: `${asset.id}:${Math.round(timeMs)}`
  };
}

function snapSourceCropToFrame({
  crop,
  contentRect
}: {
  crop: MantleSourceCrop;
  contentRect: StageRect;
}): { crop: MantleSourceCrop; guides: FrameSnapGuide[] } {
  const normalized = normalizeCrop(crop);
  const imageRect = sourceImageRectForCrop(normalized, contentRect);
  const frameCenterX = contentRect.width / 2;
  const frameCenterY = contentRect.height / 2;
  const imageCenterX = imageRect.x + imageRect.width / 2;
  const imageCenterY = imageRect.y + imageRect.height / 2;
  const xSnap = findNearestSnap({
    sources: [imageRect.x, imageCenterX, imageRect.x + imageRect.width],
    targets: [0, frameCenterX, contentRect.width]
  });
  const ySnap = findNearestSnap({
    sources: [imageRect.y, imageCenterY, imageRect.y + imageRect.height],
    targets: [0, frameCenterY, contentRect.height]
  });

  if (!xSnap && !ySnap) return { crop: normalized, guides: [] };

  return {
    crop: normalizeCrop({
      ...normalized,
      x: normalized.x - (xSnap?.delta ?? 0) / Math.max(1, imageRect.width),
      y: normalized.y - (ySnap?.delta ?? 0) / Math.max(1, imageRect.height)
    }),
    guides: [
      ...(xSnap ? [{ axis: 'x' as const, position: xSnap.position }] : []),
      ...(ySnap ? [{ axis: 'y' as const, position: ySnap.position }] : [])
    ]
  };
}

function previewSurfaceChanged(
  current: PreviewSurface | null,
  next: PreviewSurface
): boolean {
  if (!current) return true;
  const keys: Array<keyof StageRect> = ['x', 'y', 'width', 'height'];
  const rectChanged = (left: StageRect, right: StageRect) =>
    keys.some((key) => Math.abs(left[key] - right[key]) > 0.5);
  const layerRectsChanged = (
    left: PreviewSurface['textLayerCssRects'],
    right: PreviewSurface['textLayerCssRects']
  ) =>
    left.length !== right.length ||
    left.some((leftRect, index) => {
      const rightRect = right[index];
      return (
        !rightRect ||
        leftRect.id !== rightRect.id ||
        rectChanged(leftRect, rightRect) ||
        Math.abs(leftRect.rotation - rightRect.rotation) > 0.1
      );
    });

  return (
    current.canvasWidth !== next.canvasWidth ||
    current.canvasHeight !== next.canvasHeight ||
    rectChanged(current.canvasCssRect, next.canvasCssRect) ||
    rectChanged(current.contentRect, next.contentRect) ||
    rectChanged(current.contentCssRect, next.contentCssRect) ||
    Math.abs(current.contentRadius - next.contentRadius) > 0.5 ||
    current.contentCornerStyle !== next.contentCornerStyle ||
    rectChanged(current.frameRect, next.frameRect) ||
    rectChanged(current.frameCssRect, next.frameCssRect) ||
    rectChanged(current.baseFrameRect, next.baseFrameRect) ||
    rectChanged(current.baseFrameCssRect, next.baseFrameCssRect) ||
    Boolean(current.textRect) !== Boolean(next.textRect) ||
    Boolean(current.textCssRect) !== Boolean(next.textCssRect) ||
    (current.textRect && next.textRect
      ? rectChanged(current.textRect, next.textRect)
      : false) ||
    (current.textCssRect && next.textCssRect
      ? rectChanged(current.textCssRect, next.textCssRect)
      : false) ||
    layerRectsChanged(current.textLayerCssRects, next.textLayerCssRects) ||
    Math.abs(current.frameRotation - next.frameRotation) > 0.1 ||
    Math.abs(current.textRotation - next.textRotation) > 0.1
  );
}

function contentCornerStyleVars(surface: PreviewSurface): CSSProperties {
  const radius = Math.max(0, surface.contentRadius);
  const topRadius = surface.contentCornerStyle === 'all' ? radius : 0;
  const bottomRadius = surface.contentCornerStyle === 'none' ? 0 : radius;

  return {
    '--content-radius': `${radius}px`,
    '--content-radius-top': `${topRadius}px`,
    '--content-radius-bottom': `${bottomRadius}px`
  } as CSSProperties;
}

function createPreviewWorkerClient(): PreviewWorkerClient {
  const worker = new Worker(new URL('./previewRender.worker.ts', import.meta.url), {
    type: 'module'
  });

  let disposed = false;
  let nextId = 1;
  let activeJob: PreviewWorkerJob | undefined;
  let pendingJob: PreviewWorkerJob | undefined;

  const failWorker = (message: string) => {
    if (disposed) return;
    const error = new Error(message);
    if (activeJob) activeJob.reject(error);
    if (pendingJob) pendingJob.reject(error);
    activeJob = undefined;
    pendingJob = undefined;
    disposed = true;
    worker.terminate();
  };

  const cancelJob = (job: PreviewWorkerJob) => {
    job.reject(new PreviewRenderCancelledError('Preview render cancelled.'));
  };

  const startJob = (job: PreviewWorkerJob) => {
    activeJob = job;
    try {
      worker.postMessage({
        id: job.id,
        ...job.request
      });
    } catch (error) {
      activeJob = undefined;
      job.reject(
        error instanceof Error
          ? error
          : new Error('Preview worker request could not be posted.')
      );
      failWorker('Preview worker request could not be posted.');
    }
  };

  const startPendingJob = () => {
    if (disposed || activeJob || !pendingJob) return;
    const job = pendingJob;
    pendingJob = undefined;
    startJob(job);
  };

  worker.onmessage = (event: MessageEvent<PreviewWorkerResponse>) => {
    const response = event.data;
    const job = activeJob;

    if (!job || response.id !== job.id) {
      if (response.ok) response.bitmap.close();
      return;
    }

    activeJob = undefined;
    if (response.ok) {
      job.resolve({
        bitmap: response.bitmap,
        width: response.width,
        height: response.height,
        contentRect: response.contentRect,
        contentRadius: response.contentRadius,
        contentCornerStyle: response.contentCornerStyle,
        frameRect: response.frameRect,
        baseFrameRect: response.baseFrameRect,
        frameRotation: response.frameRotation,
        textRect: response.textRect,
        textRotation: response.textRotation,
        textLayerRects: response.textLayerRects
      });
    } else {
      job.reject(
        response.phase === 'render'
          ? new PreviewWorkerRenderError(response.error)
          : new Error(response.error)
      );
    }
    startPendingJob();
  };

  worker.onerror = () => {
    failWorker('Preview worker failed.');
  };

  worker.onmessageerror = () => {
    failWorker('Preview worker message could not be decoded.');
  };

  return {
    render(request) {
      if (disposed) {
        return Promise.reject(new Error('Preview worker is disposed.'));
      }

      return new Promise<PreviewWorkerResult>((resolve, reject) => {
        const job: PreviewWorkerJob = {
          id: nextId,
          request,
          resolve,
          reject
        };
        nextId += 1;

        if (activeJob) {
          if (pendingJob) cancelJob(pendingJob);
          pendingJob = job;
          return;
        }

        startJob(job);
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (activeJob) cancelJob(activeJob);
      if (pendingJob) cancelJob(pendingJob);
      activeJob = undefined;
      pendingJob = undefined;
      worker.terminate();
    }
  };
}

/**
 * Reactive preview canvas.
 *
 * Strategy: the wrapper <div> owns the layout box (sized by the stage grid),
 * JavaScript measures it, computes the largest aspect-matched box that fits,
 * and sets the canvas CSS width / height inline. The backing store is tied to
 * the target size, not the current UI zoom, so procedural backgrounds do not
 * reshuffle when the browser zoom or stage size changes.
 */
export function CardCanvas({
  card,
  target,
  asset,
  backgroundAsset,
  motionPreviewActive = false,
  backgroundAnimationEnabled = true,
  videoClip,
  videoPlaybackCommand,
  onChooseSource,
  onRelinkSource,
  onSourcePlacementChange,
  onFrameTransformChange,
  onTextChange,
  onTextLayerChange,
  onActiveTextLayerChange,
  onVideoPlaybackStateChange
}: CardCanvasProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bufferCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewWorkerRef = useRef<PreviewWorkerClient | null>(null);
  const previewRendererRef = useRef<MantlePreviewRenderer | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastVideoCommandIdRef = useRef(0);
  const sourceDragRef = useRef<SourceDragState | null>(null);
  const frameDragRef = useRef<FrameDragState | null>(null);
  const textDragRef = useRef<TextDragState | null>(null);
  const sourceCommitTimerRef = useRef<number | null>(null);
  const sourceDraftFrameRef = useRef(0);
  const frameTransformFrameRef = useRef(0);
  const textTransformFrameRef = useRef(0);
  const lastActiveTextLayerIdRef = useRef<string | undefined>(undefined);
  const pendingFrameTransformRef = useRef<MantleFrameTransform | null>(null);
  const pendingTextPatchRef = useRef<Partial<MantleCard['text']> | null>(null);
  const pendingTextLayerPatchRef = useRef<{
    id: string;
    patch: Partial<MantleTextLayer>;
  } | null>(null);
  const pendingSourceDraftRef = useRef<MantleSourceCrop | null>(null);
  const latestSourceDraftRef = useRef<MantleSourceCrop | null>(null);
  const renderSeqRef = useRef(0);
  const lastPreviewRenderStartRef = useRef(0);
  const latestRenderStateRef = useRef<PreviewRenderState | null>(null);
  const schedulePreviewRenderRef = useRef<(() => void) | null>(null);
  const motionFrameTimeRef = useRef(0);
  const motionPreviewActiveRef = useRef(motionPreviewActive);
  const backgroundAnimationEnabledRef = useRef(backgroundAnimationEnabled);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [previewSurface, setPreviewSurface] = useState<PreviewSurface | null>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [sourceEditorOpen, setSourceEditorOpen] = useState(false);
  const [frameEditorOpen, setFrameEditorOpen] = useState(false);
  const [textEditorOpen, setTextEditorOpen] = useState(false);
  const [sourceDragging, setSourceDragging] = useState(false);
  const [frameDragging, setFrameDragging] = useState(false);
  const [textDragging, setTextDragging] = useState(false);
  const [sourceDraftCrop, setSourceDraftCrop] = useState<MantleSourceCrop | null>(null);
  const [sourceSnapGuides, setSourceSnapGuides] = useState<FrameSnapGuide[]>([]);
  const [frameDraftTransform, setFrameDraftTransform] =
    useState<MantleFrameTransform | null>(null);
  const [textDraft, setTextDraft] = useState<TextDraftState | null>(null);
  const [frameSnapGuides, setFrameSnapGuides] = useState<FrameSnapGuide[]>([]);
  const [textSnapGuides, setTextSnapGuides] = useState<FrameSnapGuide[]>([]);
  const [frameRotationSnapAngle, setFrameRotationSnapAngle] =
    useState<number | null>(null);
  const [textRotationSnapAngle, setTextRotationSnapAngle] =
    useState<number | null>(null);
  const [previewAnimationAllowed, setPreviewAnimationAllowed] = useState(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return true;
    return (
      document.visibilityState !== 'hidden' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  });
  const textLayers = card.textLayers ?? [];
  const activeTextLayer =
    textLayers.find((layer) => layer.id === card.activeTextLayerId) ?? textLayers[0];
  const activeTextLayerId = activeTextLayer?.id;
  const editingTextLayer = Boolean(activeTextLayer);
  const hasAssetSource = Boolean(asset?.objectUrl);
  const isVideoSource = hasAssetSource && asset?.mediaKind === 'video';
  const canAnimateBackground =
    previewAnimationAllowed &&
    motionPreviewActive &&
    backgroundAnimationEnabled &&
    ANIMATED_PREVIEW_BACKGROUND_IDS.has(card.background.presetId);
  const hasStillAssetSource = hasAssetSource && !isVideoSource;
  const isMissingSource = Boolean(card.sourceAssetId && !hasAssetSource);
  const videoClipStartMs = videoClip?.startMs ?? 0;
  const videoClipEndMs = Math.max(
    videoClipStartMs + 1,
    videoClip?.endMs ?? asset?.durationMs ?? videoClipStartMs + 1
  );
  const videoClipLoop = videoClip?.loop ?? true;
  const reportVideoPlaybackState = useCallback(
    (video: HTMLVideoElement) => {
      onVideoPlaybackStateChange?.({
        currentTimeMs: Number.isFinite(video.currentTime)
          ? video.currentTime * 1000
          : 0,
        durationMs: Number.isFinite(video.duration) ? video.duration * 1000 : 0,
        paused: video.paused,
        muted: video.muted
      });
    },
    [onVideoPlaybackStateChange]
  );

  latestRenderStateRef.current = {
    card,
    target,
    asset: hasAssetSource ? asset : undefined,
    backgroundAsset,
    hasAssetSource
  };
  backgroundAnimationEnabledRef.current = backgroundAnimationEnabled;
  motionPreviewActiveRef.current = motionPreviewActive;

  const setVideoDecoderRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    setVideoElement(node);
  }, []);

  useEffect(() => {
    return () => {
      if (sourceCommitTimerRef.current != null) {
        window.clearTimeout(sourceCommitTimerRef.current);
      }
      cancelAnimationFrame(sourceDraftFrameRef.current);
      cancelAnimationFrame(frameTransformFrameRef.current);
      cancelAnimationFrame(textTransformFrameRef.current);
      previewWorkerRef.current?.dispose();
      previewWorkerRef.current = null;
      previewRendererRef.current?.dispose();
      previewRendererRef.current = null;
      releasePreviewBufferCanvas(bufferCanvasRef.current);
      bufferCanvasRef.current = null;
    };
  }, []);

  useEffect(() => {
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateAnimationAllowed = () => {
      setPreviewAnimationAllowed(
        document.visibilityState !== 'hidden' && !reducedMotionQuery.matches
      );
    };

    updateAnimationAllowed();
    document.addEventListener('visibilitychange', updateAnimationAllowed);
    reducedMotionQuery.addEventListener('change', updateAnimationAllowed);

    return () => {
      document.removeEventListener('visibilitychange', updateAnimationAllowed);
      reducedMotionQuery.removeEventListener('change', updateAnimationAllowed);
    };
  }, []);

  useEffect(() => {
    if (hasAssetSource) return;
    setSourceEditorOpen(false);
    setSourceDragging(false);
    setSourceDraftCrop(null);
    setSourceSnapGuides([]);
    sourceDragRef.current = null;
    latestSourceDraftRef.current = null;
    pendingSourceDraftRef.current = null;
  }, [hasAssetSource]);

  useEffect(() => {
    if (!isVideoSource && (!motionPreviewActive || !backgroundAnimationEnabled)) {
      lastVideoCommandIdRef.current = 0;
      motionFrameTimeRef.current = 0;
    }
  }, [backgroundAnimationEnabled, isVideoSource, motionPreviewActive, asset?.id]);

  useEffect(() => {
    if (!canAnimateBackground || isVideoSource) return undefined;

    let disposed = false;
    let frameId = 0;
    const startedAt = performance.now() - motionFrameTimeRef.current;

    const tick = (now: number) => {
      if (disposed) return;
      motionFrameTimeRef.current = now - startedAt;
      schedulePreviewRenderRef.current?.();
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
    };
  }, [canAnimateBackground, isVideoSource]);

  useEffect(() => {
    const video = videoElement ?? videoRef.current;
    if (!isVideoSource || !video) return;

    const currentMs = Number.isFinite(video.currentTime) ? video.currentTime * 1000 : 0;
    if (currentMs < videoClipStartMs || currentMs > videoClipEndMs) {
      video.currentTime = videoClipStartMs / 1000;
      reportVideoPlaybackState(video);
    }
  }, [
    isVideoSource,
    reportVideoPlaybackState,
    videoClipEndMs,
    videoClipStartMs,
    videoElement
  ]);

  useEffect(() => {
    if (!videoPlaybackCommand || !isVideoSource) return;
    if (videoPlaybackCommand.id <= lastVideoCommandIdRef.current) return;

    const video = videoElement ?? videoRef.current;
    if (!video) return;
    lastVideoCommandIdRef.current = videoPlaybackCommand.id;

    if (videoPlaybackCommand.type === 'toggle-playback') {
      if (video.paused) {
        const currentMs = Number.isFinite(video.currentTime)
          ? video.currentTime * 1000
          : 0;
        if (
          currentMs < videoClipStartMs ||
          currentMs >= Math.max(videoClipStartMs, videoClipEndMs - 30)
        ) {
          video.currentTime = videoClipStartMs / 1000;
        }
        void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
      reportVideoPlaybackState(video);
      return;
    }

    if (videoPlaybackCommand.type === 'seek') {
      video.currentTime = clamp(
        videoPlaybackCommand.timeMs / 1000,
        videoClipStartMs / 1000,
        videoClipEndMs / 1000
      );
      reportVideoPlaybackState(video);
      return;
    }

    if (videoPlaybackCommand.type === 'toggle-muted') {
      video.muted = !video.muted;
      reportVideoPlaybackState(video);
    }
  }, [
    asset?.id,
    isVideoSource,
    reportVideoPlaybackState,
    videoClipEndMs,
    videoClipStartMs,
    videoElement,
    videoPlaybackCommand
  ]);

  useEffect(() => {
    const video = videoElement;
    if (!isVideoSource || !video) return undefined;

    let disposed = false;
    let rafId = 0;
    let videoFrameCallbackId: number | null = null;
    const frameVideo = video as RequestVideoFrameElement;

    const cancelQueuedFrame = () => {
      if (videoFrameCallbackId != null && frameVideo.cancelVideoFrameCallback) {
        frameVideo.cancelVideoFrameCallback(videoFrameCallbackId);
      }
      videoFrameCallbackId = null;
      cancelAnimationFrame(rafId);
      rafId = 0;
    };

    const renderCurrentFrame = (timeMs?: number) => {
      const currentTimeMs =
        timeMs ??
        (Number.isFinite(video.currentTime) ? video.currentTime * 1000 : 0);
      if (currentTimeMs < videoClipStartMs) {
        video.currentTime = videoClipStartMs / 1000;
        motionFrameTimeRef.current = videoClipStartMs;
        reportVideoPlaybackState(video);
        return;
      }

      if (currentTimeMs >= videoClipEndMs) {
        if (videoClipLoop && !video.paused) {
          video.currentTime = videoClipStartMs / 1000;
          motionFrameTimeRef.current = videoClipStartMs;
          schedulePreviewRenderRef.current?.();
          reportVideoPlaybackState(video);
          return;
        }

        if (!video.paused) video.pause();
        video.currentTime = videoClipEndMs / 1000;
        motionFrameTimeRef.current = videoClipEndMs;
        schedulePreviewRenderRef.current?.();
        reportVideoPlaybackState(video);
        return;
      }

      motionFrameTimeRef.current = currentTimeMs;
      schedulePreviewRenderRef.current?.();
      reportVideoPlaybackState(video);
    };

    const requestNextFrame = () => {
      if (disposed) return;

      if (frameVideo.requestVideoFrameCallback) {
        if (videoFrameCallbackId != null) return;
        videoFrameCallbackId = frameVideo.requestVideoFrameCallback((_now, metadata) => {
          videoFrameCallbackId = null;
          renderCurrentFrame(metadata.mediaTime * 1000);
          requestNextFrame();
        });
        return;
      }

      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        renderCurrentFrame();
        if (!video.paused && !video.ended) requestNextFrame();
      });
    };

    const handleFrameStateChange = () => {
      renderCurrentFrame();
      requestNextFrame();
    };

    video.addEventListener('loadeddata', handleFrameStateChange);
    video.addEventListener('loadedmetadata', handleFrameStateChange);
    video.addEventListener('seeked', handleFrameStateChange);
    video.addEventListener('play', requestNextFrame);
    video.addEventListener('pause', handleFrameStateChange);
    video.addEventListener('timeupdate', handleFrameStateChange);

    handleFrameStateChange();

    return () => {
      disposed = true;
      video.removeEventListener('loadeddata', handleFrameStateChange);
      video.removeEventListener('loadedmetadata', handleFrameStateChange);
      video.removeEventListener('seeked', handleFrameStateChange);
      video.removeEventListener('play', requestNextFrame);
      video.removeEventListener('pause', handleFrameStateChange);
      video.removeEventListener('timeupdate', handleFrameStateChange);
      cancelQueuedFrame();
    };
  }, [
    asset?.id,
    isVideoSource,
    reportVideoPlaybackState,
    videoClipEndMs,
    videoClipLoop,
    videoClipStartMs,
    videoElement
  ]);

  useEffect(() => {
    if (activeTextLayerId) return;
    if (card.text.placement !== 'none' && (card.text.title?.trim() || card.text.subtitle?.trim())) {
      return;
    }
    setTextEditorOpen(false);
    setTextDragging(false);
    setTextDraft(null);
    setTextSnapGuides([]);
    setTextRotationSnapAngle(null);
    textDragRef.current = null;
    pendingTextPatchRef.current = null;
    pendingTextLayerPatchRef.current = null;
  }, [activeTextLayerId, card.text.placement, card.text.title, card.text.subtitle]);

  useEffect(() => {
    if (!activeTextLayerId || activeTextLayerId === lastActiveTextLayerIdRef.current) {
      lastActiveTextLayerIdRef.current = activeTextLayerId;
      return;
    }
    lastActiveTextLayerIdRef.current = activeTextLayerId;
    flushFrameTransform();
    flushSourceDraft();
    setFrameEditorOpen(false);
    setSourceEditorOpen(false);
    setTextEditorOpen(true);
  }, [activeTextLayerId]);

  useEffect(() => {
    if (!textEditorOpen || !activeTextLayerId) return;

    const frameId = requestAnimationFrame(() => {
      const input = textInputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      const cursorPosition = input.value.length;
      input.setSelectionRange(cursorPosition, cursorPosition);
    });

    return () => cancelAnimationFrame(frameId);
  }, [activeTextLayerId, textEditorOpen]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;

    let disposed = false;
    const seq = ++renderSeqRef.current;
    let rafId = 0;
    let throttleId = 0;
    let renderInFlight = false;
    let renderQueued = false;

    const updatePreviewSurface = (
      width: number,
      height: number,
      contentRect: StageRect,
      contentRadius: number,
      contentCornerStyle: PreviewSurface['contentCornerStyle'],
      frameRect: StageRect,
      baseFrameRect: StageRect,
      frameRotation: number,
      textRect: StageRect | undefined,
      textRotation: number,
      textLayerRects: PreviewWorkerResult['textLayerRects'] = []
    ) => {
      const wrapRect = wrap.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const scaleX = canvasRect.width / Math.max(1, width);
      const scaleY = canvasRect.height / Math.max(1, height);
      const nextSurface: PreviewSurface = {
        canvasWidth: width,
        canvasHeight: height,
        canvasCssRect: {
          x: canvasRect.left - wrapRect.left,
          y: canvasRect.top - wrapRect.top,
          width: canvasRect.width,
          height: canvasRect.height
        },
        contentRect,
        contentCssRect: {
          x: canvasRect.left - wrapRect.left + contentRect.x * scaleX,
          y: canvasRect.top - wrapRect.top + contentRect.y * scaleY,
          width: contentRect.width * scaleX,
          height: contentRect.height * scaleY
        },
        contentRadius: contentRadius * Math.min(scaleX, scaleY),
        contentCornerStyle,
        frameRect,
        frameCssRect: {
          x: canvasRect.left - wrapRect.left + frameRect.x * scaleX,
          y: canvasRect.top - wrapRect.top + frameRect.y * scaleY,
          width: frameRect.width * scaleX,
          height: frameRect.height * scaleY
        },
        baseFrameRect,
        baseFrameCssRect: {
          x: canvasRect.left - wrapRect.left + baseFrameRect.x * scaleX,
          y: canvasRect.top - wrapRect.top + baseFrameRect.y * scaleY,
          width: baseFrameRect.width * scaleX,
          height: baseFrameRect.height * scaleY
        },
        frameRotation,
        textRect,
        textCssRect: textRect
          ? {
              x: canvasRect.left - wrapRect.left + textRect.x * scaleX,
              y: canvasRect.top - wrapRect.top + textRect.y * scaleY,
              width: textRect.width * scaleX,
              height: textRect.height * scaleY
            }
          : undefined,
        textRotation,
        textLayerRects,
        textLayerCssRects: textLayerRects.map((rect) => ({
          id: rect.id,
          x: canvasRect.left - wrapRect.left + rect.x * scaleX,
          y: canvasRect.top - wrapRect.top + rect.y * scaleY,
          width: rect.width * scaleX,
          height: rect.height * scaleY,
          rotation: rect.rotation
        }))
      };

      setPreviewSurface((current) =>
        previewSurfaceChanged(current, nextSurface) ? nextSurface : current
      );
    };

    const drawBitmap = (
      bitmap: CanvasImageSource,
      width: number,
      height: number,
      contentRect: StageRect,
      contentRadius: number,
      contentCornerStyle: PreviewSurface['contentCornerStyle'],
      frameRect: StageRect,
      baseFrameRect: StageRect,
      frameRotation: number,
      textRect: StageRect | undefined,
      textRotation: number,
      textLayerRects: PreviewWorkerResult['textLayerRects'] = []
    ) => {
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context is unavailable.');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0);
      updatePreviewSurface(
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
      );
    };

    const render = async () => {
      if (disposed || seq !== renderSeqRef.current) return;

      renderInFlight = true;
      renderQueued = false;
      lastPreviewRenderStartRef.current = performance.now();

      const state = latestRenderStateRef.current;
      if (!state) {
        renderInFlight = false;
        return;
      }

      const style = window.getComputedStyle(wrap);
      const padX =
        Number.parseFloat(style.paddingLeft || '0') +
        Number.parseFloat(style.paddingRight || '0');
      const padY =
        Number.parseFloat(style.paddingTop || '0') +
        Number.parseFloat(style.paddingBottom || '0');
      const availW = Math.max(0, wrap.clientWidth - padX);
      const availH = Math.max(0, wrap.clientHeight - padY);
      if (availW === 0 || availH === 0) {
        renderInFlight = false;
        return;
      }

      const aspect = state.target.width / state.target.height;
      let cssW = availW;
      let cssH = availW / aspect;
      if (cssH > availH) {
        cssH = availH;
        cssW = availH * aspect;
      }

      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;

      const scale = resolveStablePreviewScale(state.target);
      const sourceFrame = resolveVideoRuntimeFrameSource(
        state.asset,
        videoRef.current
      );
      const backgroundTimeMs = backgroundAnimationEnabledRef.current
        ? sourceFrame?.timeMs ?? motionFrameTimeRef.current
        : 0;
      const renderMode = motionPreviewActiveRef.current ? 'export' : 'preview';
      const renderPayload: PreviewWorkerRequest = {
        card: state.card,
        target: state.target,
        asset: state.asset,
        backgroundAsset: state.backgroundAsset,
        scale,
        timeMs: backgroundTimeMs,
        renderMode,
        showEmptyPlaceholderText: state.hasAssetSource,
        hiddenTextLayerIds: state.hiddenTextLayerIds
      };

      try {
        let renderedInWorker = false;

        if (
          sourceFrame ||
          state.asset?.mediaKind === 'video' ||
          !shouldUsePreviewWorker(state.card, state.target, scale)
        ) {
          previewWorkerRef.current?.dispose();
          previewWorkerRef.current = null;
        } else {
          previewRendererRef.current?.dispose();
          previewRendererRef.current = null;
          releasePreviewBufferCanvas(bufferCanvasRef.current);
          bufferCanvasRef.current = null;

          const workerClient =
            previewWorkerRef.current ?? createPreviewWorkerClient();
          previewWorkerRef.current = workerClient;

          try {
            const rendered = await workerClient.render(renderPayload);
            try {
              if (disposed || seq !== renderSeqRef.current) {
                return;
              }

              drawBitmap(
                rendered.bitmap,
                rendered.width,
                rendered.height,
                rendered.contentRect,
                rendered.contentRadius,
                rendered.contentCornerStyle,
                rendered.frameRect,
                rendered.baseFrameRect,
                rendered.frameRotation,
                rendered.textRect,
                rendered.textRotation,
                rendered.textLayerRects
              );
              renderedInWorker = true;
            } finally {
              rendered.bitmap.close();
            }
          } catch (workerError) {
            const previewError = toPreviewRenderFailure(workerError);
            if (
              isPreviewRenderCancelled(previewError) ||
              disposed ||
              seq !== renderSeqRef.current
            ) {
              return;
            }

            previewWorkerRef.current?.dispose();
            previewWorkerRef.current = null;
            if (isPreviewWorkerRenderError(previewError)) {
              throw previewError;
            }
          }
        }

        if (!renderedInWorker) {
          const bufferCanvas =
            bufferCanvasRef.current ?? document.createElement('canvas');
          bufferCanvasRef.current = bufferCanvas;
          const previewRenderer =
            previewRendererRef.current ?? createMantlePreviewRenderer();
          previewRendererRef.current = previewRenderer;
          const rendered = await previewRenderer.render({
            ...renderPayload,
            canvas: bufferCanvas,
            renderMode,
            sourceFrame,
            timeMs: backgroundTimeMs
          });
          if (disposed || seq !== renderSeqRef.current) return;

          drawBitmap(
            rendered.canvas,
            rendered.width,
            rendered.height,
            rendered.contentRect,
            rendered.contentRadius,
            rendered.contentCornerStyle,
            rendered.frameRect,
            rendered.baseFrameRect,
            rendered.frameRotation,
            rendered.textRect,
            rendered.textRotation,
            rendered.textLayerRects
          );
        }

        setRenderError(null);
      } catch (error) {
        if (disposed || seq !== renderSeqRef.current) return;
        setRenderError(toPreviewRenderFailure(error).message);
      } finally {
        renderInFlight = false;
        if (renderQueued && !disposed && seq === renderSeqRef.current) {
          schedulePreviewRenderRef.current?.();
        }
      }
    };

    const schedule = () => {
      if (disposed) return;
      renderQueued = true;
      if (renderInFlight || rafId || throttleId) return;

      const run = () => {
        throttleId = 0;
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          void render();
        });
      };

      const elapsed = performance.now() - lastPreviewRenderStartRef.current;
      const delay = Math.max(0, PREVIEW_MIN_RENDER_INTERVAL_MS - elapsed);
      if (delay <= 1) {
        run();
      } else {
        throttleId = window.setTimeout(run, delay);
      }
    };

    schedule();

    const resize = new ResizeObserver(schedule);
    resize.observe(wrap);
    schedulePreviewRenderRef.current = schedule;

    return () => {
      disposed = true;
      renderSeqRef.current += 1;
      schedulePreviewRenderRef.current = null;
      cancelAnimationFrame(rafId);
      window.clearTimeout(throttleId);
      resize.disconnect();
    };
  }, []);

  useEffect(() => {
    schedulePreviewRenderRef.current?.();
  }, [
    card,
    target,
    asset,
    backgroundAsset,
    backgroundAnimationEnabled,
    hasAssetSource,
    motionPreviewActive,
    videoElement,
    textEditorOpen,
    activeTextLayerId
  ]);

  const sourceEditorStyle: CSSProperties | undefined = previewSurface
    ? {
        left: `${previewSurface.contentCssRect.x}px`,
        top: `${previewSurface.contentCssRect.y}px`,
        width: `${previewSurface.contentCssRect.width}px`,
        height: `${previewSurface.contentCssRect.height}px`,
        ...contentCornerStyleVars(previewSurface),
        transform:
          previewSurface.frameRotation === 0
            ? undefined
            : `rotate(${previewSurface.frameRotation}deg)`,
        transformOrigin:
          previewSurface.frameRotation === 0
            ? undefined
            : `${previewSurface.frameCssRect.x + previewSurface.frameCssRect.width / 2 - previewSurface.contentCssRect.x}px ${previewSurface.frameCssRect.y + previewSurface.frameCssRect.height / 2 - previewSurface.contentCssRect.y}px`
      }
    : undefined;
  const canEditSource =
    hasAssetSource &&
    Boolean(previewSurface) &&
    Boolean(onSourcePlacementChange);
  const coverCrop = resolveEditableCrop(
    { mode: 'fill' },
    hasAssetSource ? asset : undefined,
    previewSurface
  );
  const activeCrop = resolveEditableCrop(
    card.sourcePlacement,
    hasAssetSource ? asset : undefined,
    previewSurface
  );
  const visibleCrop = sourceDraftCrop ?? activeCrop;
  const activeZoom = resolveSourceCropZoom(visibleCrop, coverCrop);
  const showSourcePreview =
    hasStillAssetSource &&
    Boolean(asset?.objectUrl) &&
    Boolean(previewSurface) &&
    (Boolean(sourceDraftCrop) || (card.sourcePlacement?.mode ?? 'fit') !== 'fit');
  const sourcePreviewStyle =
    previewSurface && (showSourcePreview || (isVideoSource && sourceEditorOpen))
      ? sourcePreviewImageStyle(visibleCrop, previewSurface.contentCssRect)
      : undefined;
  const activeFrameTransform = normalizeFrameTransform(card.frameTransform);
  const visibleFrameTransform = frameDraftTransform ?? activeFrameTransform;
  const visibleFrameCssRect = previewSurface
    ? applyFrameTransformToCssRect({
        rect: previewSurface.baseFrameCssRect,
        canvasRect: previewSurface.canvasCssRect,
        transform: visibleFrameTransform
      })
    : undefined;
  const frameEditorStyle: CSSProperties | undefined = visibleFrameCssRect
    ? {
        left: `${visibleFrameCssRect.x}px`,
        top: `${visibleFrameCssRect.y}px`,
        width: `${visibleFrameCssRect.width}px`,
        height: `${visibleFrameCssRect.height}px`,
        transform: `rotate(${visibleFrameTransform.rotation}deg)`,
        '--frame-editor-counter-rotation': `${-visibleFrameTransform.rotation}deg`
      } as CSSProperties
    : undefined;
  const frameEditorToolbarStyle =
    visibleFrameCssRect && previewSurface
      ? frameToolbarStyle({
          frameRect: visibleFrameCssRect,
          canvasRect: previewSurface.canvasCssRect,
          rotation: visibleFrameTransform.rotation
        })
      : undefined;
  const activeTextLayerCssRect =
    activeTextLayerId && previewSurface
      ? previewSurface.textLayerCssRects.find((rect) => rect.id === activeTextLayerId)
      : undefined;
  const visibleTextCssRect =
    textCssRectFromDraft(textDraft) ?? activeTextLayerCssRect ?? previewSurface?.textCssRect;
  const visibleTextRotation =
    textDraft?.transform.rotation ??
    activeTextLayerCssRect?.rotation ??
    previewSurface?.textRotation ??
    0;
  const textEditorStyle: CSSProperties | undefined = visibleTextCssRect
    ? ({
        ...textHotspotStyle({
          rect: visibleTextCssRect,
          rotation: visibleTextRotation
        }),
        '--text-editor-counter-rotation': `${-visibleTextRotation}deg`
      } as CSSProperties)
    : undefined;
  const textEditorFontSize =
    activeTextLayer && previewSurface
      ? Math.max(
          32,
          Math.round(
            Math.min(previewSurface.canvasWidth, previewSurface.canvasHeight * 1.45) *
              0.04 *
              activeTextLayer.scale
          )
        ) *
        (previewSurface.canvasCssRect.width / Math.max(1, previewSurface.canvasWidth))
      : 0;
  const textEditorLineCount =
    visibleTextCssRect && textEditorFontSize > 0
      ? Math.max(1, Math.round(visibleTextCssRect.height / (textEditorFontSize * 1.1)))
      : 1;
  const textInlineInputStyle: CSSProperties | undefined =
    activeTextLayer && textEditorFontSize > 0
      ? {
          color: 'transparent',
          caretColor: activeTextLayer.color ?? card.background.palette.foreground,
          fontFamily: resolveEditorTextFontStack(activeTextLayer.font),
          fontSize: `${textEditorFontSize}px`,
          fontWeight: 600,
          letterSpacing: `${resolveEditorLetterSpacingPx(
            activeTextLayer.font,
            textEditorFontSize
          )}px`,
          lineHeight: `${textEditorFontSize * (textEditorLineCount <= 1 ? 1.06 : 1.16)}px`,
          textAlign: activeTextLayer.align,
          WebkitTextFillColor: 'transparent'
        }
      : undefined;
  const rotatedTextBounds =
    visibleTextCssRect && visibleTextRotation !== 0
      ? rotatedBounds(visibleTextCssRect, visibleTextRotation)
      : visibleTextCssRect;
  const textEditorToolbarStyle =
    rotatedTextBounds && previewSurface
      ? textToolbarStyle({
          textRect: rotatedTextBounds,
          canvasRect: previewSurface.canvasCssRect
        })
      : undefined;
  const textObstacleRects = previewSurface
    ? [
        ...previewSurface.textLayerCssRects.map((rect) => {
          const draftRect =
            rect.id === activeTextLayerId ? textCssRectFromDraft(textDraft) : undefined;
          const obstacleRect = draftRect ?? rect;
          const obstacleRotation =
            rect.id === activeTextLayerId
              ? textDraft?.transform.rotation ?? rect.rotation
              : rect.rotation;
          return obstacleRotation === 0
            ? obstacleRect
            : rotatedBounds(obstacleRect, obstacleRotation);
        }),
        ...(previewSurface.textCssRect
          ? [
              previewSurface.textRotation === 0
                ? previewSurface.textCssRect
                : rotatedBounds(previewSurface.textCssRect, previewSurface.textRotation)
            ]
          : [])
      ]
    : [];
  const stageHotspotActionsStyle =
    previewSurface
      ? stageActionsStyle({
          contentRect: previewSurface.contentCssRect,
          frameRect: previewSurface.frameCssRect,
          canvasRect: previewSurface.canvasCssRect,
          rotation: previewSurface.frameRotation,
          avoidRects: textObstacleRects
        })
      : undefined;
  const wrapViewportRect = wrapRef.current?.getBoundingClientRect();
  const frameViewportRect =
    wrapViewportRect && visibleFrameCssRect
      ? {
          x: wrapViewportRect.left + visibleFrameCssRect.x,
          y: wrapViewportRect.top + visibleFrameCssRect.y,
          width: visibleFrameCssRect.width,
          height: visibleFrameCssRect.height
      }
      : undefined;
  const textViewportRect =
    wrapViewportRect && visibleTextCssRect
      ? {
          x: wrapViewportRect.left + visibleTextCssRect.x,
          y: wrapViewportRect.top + visibleTextCssRect.y,
          width: visibleTextCssRect.width,
          height: visibleTextCssRect.height
        }
      : undefined;
  const canEditFrame = Boolean(previewSurface) && Boolean(onFrameTransformChange);
  const canEditText =
    Boolean(visibleTextCssRect) &&
    (editingTextLayer
      ? Boolean(onTextLayerChange)
      : Boolean(onTextChange) &&
        card.text.placement !== 'none' &&
        Boolean(card.text.title?.trim() || card.text.subtitle?.trim()));
  const canEditTextLayers = Boolean(previewSurface) && Boolean(onTextLayerChange);

  const clearDeferredSourceCommit = () => {
    if (sourceCommitTimerRef.current == null) return;
    window.clearTimeout(sourceCommitTimerRef.current);
    sourceCommitTimerRef.current = null;
  };

  const flushSourceDraft = (crop = latestSourceDraftRef.current) => {
    if (!crop) return;
    const normalizedCrop = normalizeCrop(crop);
    clearDeferredSourceCommit();
    latestSourceDraftRef.current = null;
    setSourceDraftCrop(null);
    setSourceSnapGuides([]);
    onSourcePlacementChange?.({
      mode: 'crop',
      crop: normalizedCrop,
      focus: resolveSourceCropFocus(normalizedCrop),
      zoom: resolveSourceCropZoom(normalizedCrop, coverCrop)
    });
  };

  const setVisualSourceDraft = (crop: MantleSourceCrop) => {
    const normalized = normalizeCrop(crop);
    latestSourceDraftRef.current = normalized;
    pendingSourceDraftRef.current = normalized;

    if (sourceDraftFrameRef.current) return;
    sourceDraftFrameRef.current = requestAnimationFrame(() => {
      sourceDraftFrameRef.current = 0;
      if (!pendingSourceDraftRef.current) return;
      setSourceDraftCrop(pendingSourceDraftRef.current);
      pendingSourceDraftRef.current = null;
    });
  };

  const scheduleSourceCropCommit = (crop: MantleSourceCrop) => {
    setSourceSnapGuides([]);
    setVisualSourceDraft(crop);
    clearDeferredSourceCommit();
    sourceCommitTimerRef.current = window.setTimeout(() => {
      flushSourceDraft(crop);
    }, 140);
  };

  const updateZoom = (zoom: number) => {
    scheduleSourceCropCommit(
      resizeCropAroundCenter(visibleCrop, coverCrop, zoom)
    );
  };

  const setVisualFrameTransform = (
    transform: MantleFrameTransform,
    options: { snap?: boolean; includeEdges?: boolean } = {}
  ) => {
    const result = options.snap
        ? snapFrameTransformToSurface({
            transform,
            surface: previewSurface,
            includeEdges: options.includeEdges ?? true
          })
        : {
            transform: normalizeFrameTransform(transform),
            guides: []
          };
    const normalized = result.transform;
    setFrameSnapGuides(result.guides);
    pendingFrameTransformRef.current = normalized;
    setFrameDraftTransform(normalized);

    if (frameTransformFrameRef.current) return;
    frameTransformFrameRef.current = requestAnimationFrame(() => {
      frameTransformFrameRef.current = 0;
      if (!pendingFrameTransformRef.current) return;
      onFrameTransformChange?.(pendingFrameTransformRef.current);
      pendingFrameTransformRef.current = null;
    });
  };

  const flushFrameTransform = () => {
    if (pendingFrameTransformRef.current) {
      onFrameTransformChange?.(pendingFrameTransformRef.current);
      pendingFrameTransformRef.current = null;
    }
    setFrameSnapGuides([]);
    setFrameRotationSnapAngle(null);
    setFrameDraftTransform(null);
  };

  const resetFrameTransform = () => {
    pendingFrameTransformRef.current = null;
    setFrameDraftTransform(null);
    setFrameSnapGuides([]);
    setFrameRotationSnapAngle(null);
    onFrameTransformChange?.({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });
  };

  const setVisualTextDraft = (
    draft: TextDraftState,
    options: { snap?: boolean; includeEdges?: boolean } = {}
  ) => {
    if (!previewSurface || (!editingTextLayer && !onTextChange)) return;
    const snapped = options.snap
      ? snapRectToCanvas({
          rect: draft.rect,
          canvasRect: previewSurface.canvasCssRect,
          includeEdges: options.includeEdges ?? true
        })
      : { rect: draft.rect, guides: [] };
    const width = clamp(draft.width, TEXT_WIDTH_MIN, TEXT_WIDTH_MAX);
    const scale = clamp(draft.scale, TEXT_SCALE_MIN, TEXT_SCALE_MAX);
    const nextDraft: TextDraftState = {
      rect: snapped.rect,
      width,
      scale,
      transform: textTransformFromCssRect({
        rect: snapped.rect,
        canvasRect: previewSurface.canvasCssRect,
        rotation: draft.transform.rotation
      })
    };

    setTextSnapGuides(snapped.guides);
    setTextDraft(nextDraft);
    if (activeTextLayerId && onTextLayerChange) {
      pendingTextLayerPatchRef.current = {
        id: activeTextLayerId,
        patch: {
          transform: nextDraft.transform,
          width,
          scale
        }
      };
      pendingTextPatchRef.current = null;
    } else {
      pendingTextPatchRef.current = {
        placement: 'free',
        transform: nextDraft.transform,
        width,
        scale
      };
      pendingTextLayerPatchRef.current = null;
    }

    if (textTransformFrameRef.current) return;
    textTransformFrameRef.current = requestAnimationFrame(() => {
      textTransformFrameRef.current = 0;
      if (pendingTextLayerPatchRef.current) {
        const pending = pendingTextLayerPatchRef.current;
        onTextLayerChange?.(pending.id, pending.patch);
        pendingTextLayerPatchRef.current = null;
        return;
      }
      if (!pendingTextPatchRef.current) return;
      onTextChange?.(pendingTextPatchRef.current);
      pendingTextPatchRef.current = null;
    });
  };

  const flushTextDraft = () => {
    if (pendingTextLayerPatchRef.current) {
      const pending = pendingTextLayerPatchRef.current;
      onTextLayerChange?.(pending.id, pending.patch);
      pendingTextLayerPatchRef.current = null;
    }
    if (pendingTextPatchRef.current) {
      onTextChange?.(pendingTextPatchRef.current);
      pendingTextPatchRef.current = null;
    }
    setTextDraft(null);
    setTextSnapGuides([]);
    setTextRotationSnapAngle(null);
  };

  const resetTextTransform = () => {
    pendingTextPatchRef.current = null;
    setTextDraft(null);
    setTextSnapGuides([]);
    setTextRotationSnapAngle(null);
    pendingTextLayerPatchRef.current = null;
    if (activeTextLayerId && onTextLayerChange) {
      onTextLayerChange(activeTextLayerId, {
        width: 0.32,
        scale: 1,
        transform: { x: 0.5, y: 0.5, rotation: 0 }
      });
      return;
    }
    onTextChange?.({
      placement: 'free',
      width: 0.68,
      scale: 1,
      transform: { x: 0.5, y: 0.5, rotation: 0 }
    });
  };

  const beginFrameDrag = (
    event: ReactPointerEvent<HTMLDivElement | HTMLButtonElement>,
    mode: FrameDragMode,
    handle?: FrameResizeHandle
  ) => {
    if (!frameViewportRect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setFrameDragging(true);
    setFrameRotationSnapAngle(null);
    setFrameDraftTransform(visibleFrameTransform);
    frameDragRef.current = {
      pointerId: event.pointerId,
      mode,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      transform: visibleFrameTransform,
      startAngle: frameTransformAngle(event, frameViewportRect)
    };
  };

  const beginTextDrag = (
    event: ReactPointerEvent<HTMLDivElement | HTMLButtonElement>,
    mode: TextDragMode,
    handle?: TextResizeHandle
  ) => {
    if (!previewSurface || !visibleTextCssRect || !textViewportRect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setTextDragging(true);
    setTextRotationSnapAngle(null);
    const transform = textTransformFromCssRect({
      rect: visibleTextCssRect,
      canvasRect: previewSurface.canvasCssRect,
      rotation: visibleTextRotation
    });
    const width = clamp(
      activeTextLayer?.width ?? card.text.width,
      TEXT_WIDTH_MIN,
      TEXT_WIDTH_MAX
    );
    const scale = clamp(
      activeTextLayer?.scale ?? card.text.scale,
      TEXT_SCALE_MIN,
      TEXT_SCALE_MAX
    );
    setTextDraft({
      rect: visibleTextCssRect,
      transform,
      width,
      scale
    });
    textDragRef.current = {
      pointerId: event.pointerId,
      mode,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      rect: visibleTextCssRect,
      transform,
      width,
      scale,
      startAngle: textTransformAngle(event, textViewportRect)
    };
  };

  const updateFrameDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = frameDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !previewSurface || !frameViewportRect) {
      return;
    }

    if (drag.mode === 'move') {
      setVisualFrameTransform({
        ...drag.transform,
        x: drag.transform.x + (event.clientX - drag.startX) / Math.max(1, previewSurface.canvasCssRect.width),
        y: drag.transform.y + (event.clientY - drag.startY) / Math.max(1, previewSurface.canvasCssRect.height)
      }, {
        snap: !event.altKey,
        includeEdges: true
      });
      return;
    }

    if (drag.mode === 'resize' && drag.handle) {
      const direction = resizeHandleDirections(drag.handle);
      const delta = localFrameDelta({
        deltaX: event.clientX - drag.startX,
        deltaY: event.clientY - drag.startY,
        rotation: drag.transform.rotation
      });
      const baseWidth = Math.max(1, previewSurface.baseFrameCssRect.width);
      const baseHeight = Math.max(1, previewSurface.baseFrameCssRect.height);
      const startWidth = baseWidth * drag.transform.scaleX;
      const startHeight = baseHeight * drag.transform.scaleY;

      if (isCornerResizeHandle(drag.handle)) {
        const handleVectorX = (direction.x * startWidth) / 2;
        const handleVectorY = (direction.y * startHeight) / 2;
        const diagonalLengthSquared =
          handleVectorX * handleVectorX + handleVectorY * handleVectorY;
        const multiplierDelta =
          diagonalLengthSquared <= 0
            ? 0
            : (delta.x * handleVectorX + delta.y * handleVectorY) /
              diagonalLengthSquared;
        const minMultiplier = Math.max(
          FRAME_SCALE_MIN / drag.transform.scaleX,
          FRAME_SCALE_MIN / drag.transform.scaleY
        );
        const maxMultiplier = Math.min(
          FRAME_SCALE_MAX / drag.transform.scaleX,
          FRAME_SCALE_MAX / drag.transform.scaleY
        );
        const multiplier = clamp(
          1 + multiplierDelta,
          minMultiplier,
          maxMultiplier
        );

        setVisualFrameTransform({
          ...drag.transform,
          scaleX: drag.transform.scaleX * multiplier,
          scaleY: drag.transform.scaleY * multiplier
        }, {
          snap: !event.altKey,
          includeEdges: false
        });
        return;
      }

      const nextWidth =
        direction.x === 0 ? startWidth : startWidth + delta.x * direction.x * 2;
      const nextHeight =
        direction.y === 0 ? startHeight : startHeight + delta.y * direction.y * 2;

      setVisualFrameTransform({
        ...drag.transform,
        scaleX:
          direction.x === 0
            ? drag.transform.scaleX
            : clamp(nextWidth / baseWidth, FRAME_SCALE_MIN, FRAME_SCALE_MAX),
        scaleY:
          direction.y === 0
            ? drag.transform.scaleY
            : clamp(nextHeight / baseHeight, FRAME_SCALE_MIN, FRAME_SCALE_MAX)
      }, {
        snap: !event.altKey,
        includeEdges: false
      });
      return;
    }

    const angle = frameTransformAngle(event, frameViewportRect);
    const nextRotation = normalizeRotation(
      drag.transform.rotation + ((angle - drag.startAngle) * 180) / Math.PI
    );
    const rotationSnap = event.altKey
      ? { rotation: nextRotation, anchor: null }
      : snapFrameRotation(nextRotation);
    setFrameSnapGuides([]);
    setFrameRotationSnapAngle(rotationSnap.anchor);
    setVisualFrameTransform({
      ...drag.transform,
      rotation: rotationSnap.rotation
    });
  };

  const updateTextDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = textDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !previewSurface || !textViewportRect) {
      return;
    }

    if (drag.mode === 'move') {
      setVisualTextDraft({
        ...drag,
        rect: {
          ...drag.rect,
          x: drag.rect.x + event.clientX - drag.startX,
          y: drag.rect.y + event.clientY - drag.startY
        }
      }, {
        snap: !event.altKey,
        includeEdges: true
      });
      return;
    }

    if (drag.mode === 'resize' && drag.handle) {
      const direction = resizeHandleDirections(drag.handle);
      const delta = localFrameDelta({
        deltaX: event.clientX - drag.startX,
        deltaY: event.clientY - drag.startY,
        rotation: drag.transform.rotation
      });
      const centerX = drag.rect.x + drag.rect.width / 2;
      const centerY = drag.rect.y + drag.rect.height / 2;

      if (isCornerResizeHandle(drag.handle)) {
        const handleVectorX = (direction.x * drag.rect.width) / 2;
        const handleVectorY = (direction.y * drag.rect.height) / 2;
        const diagonalLengthSquared =
          handleVectorX * handleVectorX + handleVectorY * handleVectorY;
        const multiplierDelta =
          diagonalLengthSquared <= 0
            ? 0
            : (delta.x * handleVectorX + delta.y * handleVectorY) /
              diagonalLengthSquared;
        const minMultiplier = Math.max(
          TEXT_WIDTH_MIN / drag.width,
          TEXT_SCALE_MIN / drag.scale
        );
        const maxMultiplier = Math.min(
          TEXT_WIDTH_MAX / drag.width,
          TEXT_SCALE_MAX / drag.scale
        );
        const multiplier = clamp(1 + multiplierDelta, minMultiplier, maxMultiplier);
        const nextWidth = drag.width * multiplier;
        const nextScale = drag.scale * multiplier;
        const nextCssWidth = drag.rect.width * multiplier;
        const nextCssHeight = drag.rect.height * multiplier;

        setVisualTextDraft({
          rect: {
            x: centerX - nextCssWidth / 2,
            y: centerY - nextCssHeight / 2,
            width: nextCssWidth,
            height: nextCssHeight
          },
          transform: drag.transform,
          width: nextWidth,
          scale: nextScale
        }, {
          snap: !event.altKey,
          includeEdges: false
        });
        return;
      }

      const nextCssWidth = Math.max(1, drag.rect.width + delta.x * direction.x * 2);
      const nextWidth = clamp(
        nextCssWidth / Math.max(1, previewSurface.canvasCssRect.width),
        TEXT_WIDTH_MIN,
        TEXT_WIDTH_MAX
      );
      const clampedCssWidth = nextWidth * previewSurface.canvasCssRect.width;

      setVisualTextDraft({
        rect: {
          ...drag.rect,
          x: centerX - clampedCssWidth / 2,
          width: clampedCssWidth
        },
        transform: drag.transform,
        width: nextWidth,
        scale: drag.scale
      }, {
        snap: !event.altKey,
        includeEdges: false
      });
      return;
    }

    const angle = textTransformAngle(event, textViewportRect);
    const nextRotation = normalizeRotation(
      drag.transform.rotation + ((angle - drag.startAngle) * 180) / Math.PI
    );
    const rotationSnap = event.altKey
      ? { rotation: nextRotation, anchor: null }
      : snapFrameRotation(nextRotation);
    setTextSnapGuides([]);
    setTextRotationSnapAngle(rotationSnap.anchor);
    setVisualTextDraft({
      rect: drag.rect,
      width: drag.width,
      scale: drag.scale,
      transform: {
        ...drag.transform,
        rotation: rotationSnap.rotation
      }
    });
  };

  const endFrameDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (frameDragRef.current?.pointerId !== event.pointerId) return;
    frameDragRef.current = null;
    setFrameDragging(false);
    flushFrameTransform();
  };

  const endTextDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (textDragRef.current?.pointerId !== event.pointerId) return;
    textDragRef.current = null;
    setTextDragging(false);
    flushTextDraft();
  };

  const openFrameEditor = () => {
    flushSourceDraft();
    flushTextDraft();
    setSourceEditorOpen(false);
    setTextEditorOpen(false);
    setFrameEditorOpen(true);
  };

  const openSourceEditor = () => {
    flushFrameTransform();
    flushTextDraft();
    setFrameEditorOpen(false);
    setTextEditorOpen(false);
    setSourceEditorOpen(true);
  };

  const openTextEditor = () => {
    if (!previewSurface || !visibleTextCssRect || (!editingTextLayer && !onTextChange)) return;
    flushFrameTransform();
    flushSourceDraft();
    const transform = textTransformFromCssRect({
      rect: visibleTextCssRect,
      canvasRect: previewSurface.canvasCssRect,
      rotation: visibleTextRotation
    });
    const width = clamp(
      visibleTextCssRect.width / Math.max(1, previewSurface.canvasCssRect.width),
      TEXT_WIDTH_MIN,
      TEXT_WIDTH_MAX
    );
    setFrameEditorOpen(false);
    setSourceEditorOpen(false);
    setTextEditorOpen(true);
    setTextDraft(null);
    setTextSnapGuides([]);
    setTextRotationSnapAngle(null);
    onActiveTextLayerChange?.(activeTextLayerId);
    if (!editingTextLayer && (card.text.placement !== 'free' || !card.text.transform)) {
      onTextChange?.({
        placement: 'free',
        transform,
        width
      });
    }
  };

  const openTextLayerEditor = (layerId: string) => {
    if (layerId === activeTextLayerId) {
      openTextEditor();
      return;
    }

    flushFrameTransform();
    flushSourceDraft();
    flushTextDraft();
    setFrameEditorOpen(false);
    setSourceEditorOpen(false);
    setTextEditorOpen(false);
    onActiveTextLayerChange?.(layerId);
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <canvas
        className={styles.canvas}
        ref={canvasRef}
        // Canvas starts hidden until JS measures the wrapper. Prevents the
        // intrinsic canvas size (width attribute) from forcing parent growth.
        style={{ width: 0, height: 0 }}
      />
      {frameEditorOpen && previewSurface
        ? frameSnapGuides.map((guide) => (
            <div
              key={`${guide.axis}-${Math.round(guide.position)}`}
              className={
                guide.axis === 'x'
                  ? `${styles.frameSnapGuide} ${styles.frameSnapGuideVertical}`
                  : `${styles.frameSnapGuide} ${styles.frameSnapGuideHorizontal}`
              }
              style={
                guide.axis === 'x'
                  ? {
                      left: `${guide.position}px`,
                      top: `${previewSurface.canvasCssRect.y}px`,
                      height: `${previewSurface.canvasCssRect.height}px`
                    }
                  : {
                      left: `${previewSurface.canvasCssRect.x}px`,
                      top: `${guide.position}px`,
                      width: `${previewSurface.canvasCssRect.width}px`
                    }
              }
            />
          ))
        : null}
      {textEditorOpen && previewSurface
        ? textSnapGuides.map((guide) => (
            <div
              key={`text-${guide.axis}-${Math.round(guide.position)}`}
              className={
                guide.axis === 'x'
                  ? `${styles.frameSnapGuide} ${styles.frameSnapGuideVertical}`
                  : `${styles.frameSnapGuide} ${styles.frameSnapGuideHorizontal}`
              }
              style={
                guide.axis === 'x'
                  ? {
                      left: `${guide.position}px`,
                      top: `${previewSurface.canvasCssRect.y}px`,
                      height: `${previewSurface.canvasCssRect.height}px`
                    }
                  : {
                      left: `${previewSurface.canvasCssRect.x}px`,
                      top: `${guide.position}px`,
                      width: `${previewSurface.canvasCssRect.width}px`
                    }
              }
            />
          ))
        : null}
      {isVideoSource && asset?.objectUrl ? (
        <video
          ref={setVideoDecoderRef}
          className={styles.videoDecoder}
          playsInline
          preload="auto"
          src={asset.objectUrl}
          onDurationChange={(event) =>
            reportVideoPlaybackState(event.currentTarget)
          }
          onLoadedData={() => schedulePreviewRenderRef.current?.()}
          onLoadedMetadata={(event) => {
            reportVideoPlaybackState(event.currentTarget);
            schedulePreviewRenderRef.current?.();
          }}
          onPause={(event) => reportVideoPlaybackState(event.currentTarget)}
          onPlay={(event) => reportVideoPlaybackState(event.currentTarget)}
          onVolumeChange={(event) =>
            reportVideoPlaybackState(event.currentTarget)
          }
        />
      ) : null}
      {hasAssetSource && sourceEditorStyle && !frameEditorOpen && !sourceEditorOpen && !textEditorOpen && (canEditFrame || canEditSource) ? (
        <div className={styles.stageHotspot} style={sourceEditorStyle}>
          <div
            className={styles.stageHotspotActions}
            style={stageHotspotActionsStyle}
          >
            {canEditFrame ? (
              <button
                type="button"
                className={styles.stageHotspotButton}
                onClick={openFrameEditor}
                title="Edit frame"
              >
                Frame
              </button>
            ) : null}
            {canEditSource ? (
              <button
                type="button"
                className={styles.stageHotspotButton}
                onClick={openSourceEditor}
                title="Edit media placement"
              >
                Media
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {canEditTextLayers && !frameEditorOpen && !sourceEditorOpen && !textEditorOpen
        ? previewSurface?.textLayerCssRects.map((rect) => (
            <button
              key={rect.id}
              type="button"
              className={`${styles.stageHotspot} ${styles.textHotspot}`}
              style={textHotspotStyle({ rect, rotation: rect.rotation })}
              onClick={() => openTextLayerEditor(rect.id)}
              title="Edit text"
            />
          ))
        : null}
      {!canEditTextLayers && canEditText && textEditorStyle && !frameEditorOpen && !sourceEditorOpen && !textEditorOpen ? (
        <button
          type="button"
          className={`${styles.stageHotspot} ${styles.textHotspot}`}
          style={textEditorStyle}
          onClick={openTextEditor}
          title="Edit text"
        />
      ) : null}
      {canEditFrame && frameEditorStyle && frameEditorOpen ? (
        <div
          className={
            frameDragging
              ? `${styles.frameEditor} ${styles.frameEditorDragging}`
              : styles.frameEditor
          }
          style={frameEditorStyle}
          onPointerDown={(event) => beginFrameDrag(event, 'move')}
          onPointerMove={updateFrameDrag}
          onPointerUp={endFrameDrag}
          onPointerCancel={endFrameDrag}
        >
          <button
            type="button"
            className={
              frameRotationSnapAngle !== null
                ? `${styles.frameRotateHandle} ${styles.frameRotateHandleSnapped}`
                : styles.frameRotateHandle
            }
            onPointerDown={(event) => {
              event.stopPropagation();
              beginFrameDrag(event, 'rotate');
            }}
            title="Rotate frame"
          />
          {frameRotationSnapAngle !== null ? (
            <div className={styles.frameRotationBadge}>
              {formatRotationAngle(frameRotationSnapAngle)}
            </div>
          ) : null}
          {(['n', 'e', 's', 'w', 'nw', 'ne', 'sw', 'se'] as const).map((handle) => (
            <button
              key={handle}
              type="button"
              className={`${styles.frameScaleHandle} ${styles[`frameScaleHandle${handle.toUpperCase()}`]}`}
              onPointerDown={(event) => {
                event.stopPropagation();
                beginFrameDrag(event, 'resize', handle);
              }}
              title="Resize frame"
            />
          ))}
        </div>
      ) : null}
      {canEditFrame && frameEditorToolbarStyle && frameEditorOpen ? (
        <div
          className={styles.frameEditorToolbar}
          style={frameEditorToolbarStyle}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className={styles.frameToolButton}
            onClick={resetFrameTransform}
          >
            Reset
          </button>
          <button
            type="button"
            className={`${styles.frameToolButton} ${styles.frameDoneButton}`}
            onClick={() => {
              flushFrameTransform();
              setFrameEditorOpen(false);
            }}
          >
            Done
          </button>
        </div>
      ) : null}
      {canEditText && textEditorStyle && textEditorOpen ? (
        <div
          className={
            textDragging
              ? `${styles.textEditor} ${styles.textEditorDragging}`
              : styles.textEditor
          }
          style={textEditorStyle}
          onPointerDown={(event) => beginTextDrag(event, 'move')}
          onPointerMove={updateTextDrag}
          onPointerUp={endTextDrag}
          onPointerCancel={endTextDrag}
        >
          {activeTextLayer && onTextLayerChange ? (
            <textarea
              ref={textInputRef}
              className={styles.textInlineInput}
              style={textInlineInputStyle}
              value={activeTextLayer.text}
              rows={1}
              spellCheck={false}
              onChange={(event) =>
                onTextLayerChange(activeTextLayer.id, {
                  text: event.currentTarget.value
                })
              }
            />
          ) : null}
          <button
            type="button"
            className={
              textRotationSnapAngle !== null
                ? `${styles.textRotateHandle} ${styles.textRotateHandleSnapped}`
                : styles.textRotateHandle
            }
            onPointerDown={(event) => {
              event.stopPropagation();
              beginTextDrag(event, 'rotate');
            }}
            title="Rotate text"
          />
          {textRotationSnapAngle !== null ? (
            <div className={styles.textRotationBadge}>
              {formatRotationAngle(textRotationSnapAngle)}
            </div>
          ) : null}
          {(['e', 'w', 'nw', 'ne', 'sw', 'se'] as const).map((handle) => (
            <button
              key={handle}
              type="button"
              className={`${styles.textScaleHandle} ${styles[`textScaleHandle${handle.toUpperCase()}`]}`}
              onPointerDown={(event) => {
                event.stopPropagation();
                beginTextDrag(event, 'resize', handle);
              }}
              title={
                handle === 'e' || handle === 'w'
                  ? 'Resize text width'
                  : 'Resize text scale'
              }
            />
          ))}
        </div>
      ) : null}
      {canEditText && textEditorToolbarStyle && textEditorOpen ? (
        <div
          className={styles.textEditorToolbar}
          style={textEditorToolbarStyle}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className={styles.textToolButton}
            onClick={resetTextTransform}
          >
            Reset
          </button>
          <button
            type="button"
            className={`${styles.textToolButton} ${styles.textDoneButton}`}
            onClick={() => {
              flushTextDraft();
              setTextEditorOpen(false);
            }}
          >
            Done
          </button>
        </div>
      ) : null}
      {canEditSource && sourceEditorStyle && sourceEditorOpen ? (
        <div
          className={
            sourceDragging
              ? `${styles.sourceEditor} ${styles.sourceEditorDragging}`
              : styles.sourceEditor
          }
          style={sourceEditorStyle}
          onPointerDown={(event) => {
            if (!previewSurface) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            setSourceDragging(true);
            setVisualSourceDraft(visibleCrop);
            sourceDragRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              crop: visibleCrop
            };
          }}
          onPointerMove={(event) => {
            const drag = sourceDragRef.current;
            if (!drag || drag.pointerId !== event.pointerId || !previewSurface) return;
            const nextCrop = moveCropByContentDelta(
              drag.crop,
              event.clientX - drag.startX,
              event.clientY - drag.startY,
              previewSurface.contentCssRect
            );
            const snapped = event.altKey
              ? { crop: nextCrop, guides: [] }
              : snapSourceCropToFrame({
                  crop: nextCrop,
                  contentRect: previewSurface.contentCssRect
                });
            setSourceSnapGuides(snapped.guides);
            setVisualSourceDraft(snapped.crop);
          }}
          onPointerUp={(event) => {
            if (sourceDragRef.current?.pointerId === event.pointerId) {
              sourceDragRef.current = null;
              setSourceDragging(false);
              flushSourceDraft();
            }
          }}
          onPointerCancel={(event) => {
            if (sourceDragRef.current?.pointerId === event.pointerId) {
              sourceDragRef.current = null;
              setSourceDragging(false);
              setSourceDraftCrop(null);
              setSourceSnapGuides([]);
              latestSourceDraftRef.current = null;
              pendingSourceDraftRef.current = null;
            }
          }}
          onWheel={(event) => {
            event.preventDefault();
            if (!previewSurface) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const anchorX = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
            const anchorY = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
            scheduleSourceCropCommit(
              resizeCropAroundAnchor({
                crop: visibleCrop,
                coverCrop,
                zoom: activeZoom - event.deltaY * 0.0045,
                anchorX,
                anchorY
              })
            );
          }}
        >
          {asset?.objectUrl && sourcePreviewStyle ? (
            <div className={styles.sourcePreviewClip} aria-hidden="true">
              {isVideoSource ? (
                <video
                  className={styles.sourcePreviewImage}
                  muted
                  playsInline
                  preload="metadata"
                  src={asset.objectUrl}
                  style={sourcePreviewStyle}
                />
              ) : (
                <img
                  alt=""
                  className={styles.sourcePreviewImage}
                  draggable={false}
                  src={asset.objectUrl}
                  style={sourcePreviewStyle}
                />
              )}
            </div>
          ) : null}
          {sourceSnapGuides.map((guide) => (
            <div
              key={`${guide.axis}-${Math.round(guide.position)}`}
              className={
                guide.axis === 'x'
                  ? `${styles.sourceSnapGuide} ${styles.sourceSnapGuideVertical}`
                  : `${styles.sourceSnapGuide} ${styles.sourceSnapGuideHorizontal}`
              }
              style={
                guide.axis === 'x'
                  ? { left: `${guide.position}px` }
                  : { top: `${guide.position}px` }
              }
            />
          ))}
          <div
            className={styles.sourceEditorToolbar}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={
                (card.sourcePlacement?.mode ?? 'fit') === 'fit'
                  ? `${styles.sourceToolButton} ${styles.sourceToolButtonActive}`
                  : styles.sourceToolButton
              }
              onClick={() => {
                clearDeferredSourceCommit();
                setSourceDraftCrop(null);
                setSourceSnapGuides([]);
                latestSourceDraftRef.current = null;
                pendingSourceDraftRef.current = null;
                onSourcePlacementChange?.({ mode: 'fit' });
              }}
            >
              Fit
            </button>
            <button
              type="button"
              className={
                card.sourcePlacement?.mode === 'fill'
                  ? `${styles.sourceToolButton} ${styles.sourceToolButtonActive}`
                  : styles.sourceToolButton
              }
              onClick={() => {
                clearDeferredSourceCommit();
                setSourceDraftCrop(null);
                setSourceSnapGuides([]);
                latestSourceDraftRef.current = null;
                pendingSourceDraftRef.current = null;
                onSourcePlacementChange?.({ mode: 'fill' });
              }}
            >
              Fill
            </button>
            <button
              type="button"
              className={styles.sourceToolButton}
              onClick={() => flushSourceDraft(centerCrop(visibleCrop))}
            >
              Center
            </button>
            <label className={styles.sourceZoomControl}>
              <span>Zoom</span>
              <input
                type="range"
                min={SOURCE_PLACEMENT_ZOOM_MIN}
                max={SOURCE_PLACEMENT_ZOOM_MAX}
                step={0.01}
                value={activeZoom}
                onChange={(event) => updateZoom(Number(event.currentTarget.value))}
              />
            </label>
            <button
              type="button"
              className={`${styles.sourceToolButton} ${styles.sourceDoneButton}`}
              onClick={() => {
                flushSourceDraft();
                setSourceEditorOpen(false);
              }}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
      {!hasAssetSource ? (
        <div className={styles.emptyOverlay}>
          <div
            className={
              isMissingSource
                ? `${styles.emptyPanel} ${styles.missingPanel}`
                : styles.emptyPanel
            }
          >
            <div className={styles.emptyHeader}>
              <span className={styles.emptyMark} aria-hidden="true">
                <Icon name={isMissingSource ? 'alert' : 'upload'} size={20} />
              </span>
              <div className={styles.emptyHeading}>
                <span className={styles.emptyTitle}>
                  {isMissingSource ? 'Source media missing' : 'Drop media'}
                </span>
                <span className={styles.emptySub}>
                  {isMissingSource
                    ? `${asset?.name ?? 'Saved source'} was not embedded in this project file.`
                    : 'Start with an image or video to compose a social-ready card'}
                </span>
              </div>
            </div>
            <ol className={styles.emptyHints}>
              <li>
                <span className={styles.emptyHintKey}>Drop</span>
                <span>
                  {isMissingSource
                    ? 'the original media anywhere to relink'
                    : 'media anywhere on the workspace'}
                </span>
              </li>
              <li>
                <span className={styles.emptyHintKey}>⌘ V</span>
                <span>
                  {isMissingSource
                    ? 'paste the source image from clipboard'
                    : 'paste from clipboard'}
                </span>
              </li>
              <li>
                <button
                  className={styles.chooseButton}
                  type="button"
                  onClick={isMissingSource ? onRelinkSource : onChooseSource}
                >
                  <Icon name="image" size={14} />
                  <span>{isMissingSource ? 'Relink media' : 'Choose media'}</span>
                </button>
                <span className={styles.emptyHintAside}>
                  Images or video
                </span>
              </li>
            </ol>
          </div>
        </div>
      ) : null}
      {renderError ? <div className={styles.errorLayer}>{renderError}</div> : null}
    </div>
  );
}
