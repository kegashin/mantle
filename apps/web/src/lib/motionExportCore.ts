import { renderMantleFrameAt } from '@mantle/engine/render';
import type {
  MantleCard,
  MantleRenderableAsset,
  MantleSurfaceTarget
} from '@mantle/schemas/model';

export type MantleMotionExportInput = {
  card: MantleCard;
  target: MantleSurfaceTarget;
  asset?: MantleRenderableAsset | undefined;
  backgroundAsset?: MantleRenderableAsset | undefined;
  scale?: number | undefined;
  signal?: AbortSignal | undefined;
  onProgress?: ((progress: MantleMotionExportProgress) => void) | undefined;
};

export type MantleMotionExportProgress = {
  phase: 'preparing' | 'rendering' | 'recording' | 'finalizing';
  progress: number;
  detail: string;
};

export type MantleMotionExportPlan = {
  startMs: number;
  endMs: number;
  durationMs: number;
  frameRate: number;
  frameCount: number;
  scale: number;
  pixelCount: number;
};

type MotionExportPlanOptions = {
  defaultDurationMs: number;
  defaultFrameRate: number;
  maxDurationMs: number;
  maxFrameRate: number;
  maxFrames: number;
  maxPixelCount: number;
  minFrameRate: number;
  requestedDurationMs?: number | undefined;
  label: string;
};

const MIN_MOTION_DURATION_MS = 100;

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function throwIfMotionExportAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Export canceled.', 'AbortError');
  }
}

export function reportMotionProgress(
  input: MantleMotionExportInput,
  progress: MantleMotionExportProgress
): void {
  input.onProgress?.({
    ...progress,
    progress: clampNumber(progress.progress, 0, 1)
  });
}

function resolveMotionClipRange(
  card: MantleCard,
  options: MotionExportPlanOptions,
  asset?: MantleRenderableAsset
): { startMs: number; endMs: number; durationMs: number } {
  const sourceDuration =
    asset?.mediaKind === 'video' && asset.durationMs ? asset.durationMs : undefined;
  const maxEnd = Math.min(sourceDuration ?? options.maxDurationMs, options.maxDurationMs);
  const startMs = clampNumber(
    card.export.videoStartMs ?? 0,
    0,
    Math.max(0, maxEnd - MIN_MOTION_DURATION_MS)
  );
  const requestedEnd = card.export.videoEndMs ?? sourceDuration;

  if (requestedEnd != null) {
    const endMs = clampNumber(requestedEnd, startMs + MIN_MOTION_DURATION_MS, maxEnd);
    return { startMs, endMs, durationMs: endMs - startMs };
  }

  const duration = options.requestedDurationMs ?? options.defaultDurationMs;
  const durationMs = clampNumber(duration, MIN_MOTION_DURATION_MS, maxEnd - startMs);
  return { startMs, endMs: startMs + durationMs, durationMs };
}

function resolveFrameRate(
  card: MantleCard,
  options: Pick<
    MotionExportPlanOptions,
    'defaultFrameRate' | 'maxFrameRate' | 'minFrameRate'
  >
): number {
  return Math.round(
    clampNumber(
      card.export.videoFrameRate ?? options.defaultFrameRate,
      options.minFrameRate,
      options.maxFrameRate
    )
  );
}

export function createMantleMotionExportPlan(
  input: MantleMotionExportInput,
  options: MotionExportPlanOptions
): MantleMotionExportPlan {
  const { startMs, endMs, durationMs } = resolveMotionClipRange(
    input.card,
    options,
    input.asset
  );
  const frameRate = resolveFrameRate(input.card, options);
  const frameIntervalMs = 1000 / frameRate;
  const frameCount = Math.max(2, Math.ceil(durationMs / frameIntervalMs));
  const scale = input.scale ?? input.card.export.scale;
  const pixelCount = Math.round(
    input.target.width * scale * input.target.height * scale
  );

  if (pixelCount > options.maxPixelCount) {
    throw new Error(
      `${options.label} export is too large. Lower Scale or canvas size before exporting ${options.label}.`
    );
  }

  if (frameCount > options.maxFrames) {
    throw new Error(
      `${options.label} export is too long. Trim the clip or lower FPS before exporting ${options.label}.`
    );
  }

  return {
    startMs,
    endMs,
    durationMs,
    frameRate,
    frameCount,
    scale,
    pixelCount
  };
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: keyof HTMLMediaElementEventMap
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timeoutId = 0;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener(eventName, handleEvent);
      video.removeEventListener('error', handleError);
    };
    const handleEvent = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('Video source could not be decoded for export.'));
    };

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('Video source took too long to prepare for export.'));
    }, 15_000);

    video.addEventListener(eventName, handleEvent, { once: true });
    video.addEventListener('error', handleError, { once: true });
  });
}

export async function createMotionVideoDecoder(
  asset: MantleRenderableAsset
): Promise<HTMLVideoElement> {
  if (!asset.objectUrl) {
    throw new Error('Relink the local video before exporting.');
  }

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = asset.objectUrl;
  video.load();

  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    await waitForVideoEvent(video, 'loadedmetadata');
  }

  return video;
}

export async function seekMotionVideoFrame(
  video: HTMLVideoElement,
  timeMs: number
): Promise<void> {
  const durationMs = Number.isFinite(video.duration) ? video.duration * 1000 : timeMs;
  const targetSeconds = clampNumber(timeMs, 0, durationMs) / 1000;
  const sameTime = Math.abs(video.currentTime - targetSeconds) < 0.002;

  if (sameTime && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return;
  }

  if (sameTime) {
    await waitForVideoEvent(video, 'loadeddata');
    return;
  }

  const seeked = waitForVideoEvent(video, 'seeked');
  video.currentTime = targetSeconds;
  await seeked;

  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await waitForVideoEvent(video, 'loadeddata');
  }
}

export async function renderMantleMotionFrame({
  input,
  canvas,
  video,
  timeMs
}: {
  input: MantleMotionExportInput;
  canvas: HTMLCanvasElement;
  video?: HTMLVideoElement | undefined;
  timeMs: number;
}): Promise<void> {
  if (video) {
    await seekMotionVideoFrame(video, timeMs);
  }

  const backgroundTimeMs = input.card.export.animateBackground === false ? 0 : timeMs;

  await renderMantleFrameAt({
    card: input.card,
    target: input.target,
    asset: input.asset,
    backgroundAsset: input.backgroundAsset,
    sourceFrame: video
      ? {
          source: video,
          width: video.videoWidth || input.asset?.width || 1,
          height: video.videoHeight || input.asset?.height || 1,
          timeMs,
          cacheKey: `${input.asset?.id ?? 'video'}:${Math.round(timeMs)}`
        }
      : undefined,
    timeMs: backgroundTimeMs,
    scale: input.scale ?? input.card.export.scale,
    canvas,
    renderMode: 'export'
  });
}
