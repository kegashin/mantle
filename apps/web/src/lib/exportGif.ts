import {
  MAX_ANIMATED_GIF_PIXELS,
  createAnimatedGifEncoder,
  resolveMantleExportFileName
} from '@mantle/engine/render';
import type { ExportResult } from '@mantle/schemas/model';

import {
  createMantleMotionExportPlan,
  createMotionVideoDecoder,
  renderMantleMotionFrame,
  reportMotionProgress,
  throwIfMotionExportAborted,
  type MantleMotionExportInput,
  type MantleMotionExportPlan,
  type MantleMotionExportProgress
} from './motionExportCore';

export type MantleGifExportInput = MantleMotionExportInput;
export type MantleGifExportProgress = MantleMotionExportProgress;
export type MantleGifExportPlan = MantleMotionExportPlan & {
  frameDelayMs: number;
  mimeType: 'image/gif';
};

const DEFAULT_GIF_DURATION_MS = 3000;
const DEFAULT_GIF_FRAME_RATE = 12;
const GIF_EXPORT_MAX_DURATION_MS = 30000;
const GIF_EXPORT_MAX_FRAMES = 240;
const GIF_EXPORT_MAX_TOTAL_FRAME_PIXELS = 240_000_000;

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function getReadableCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('GIF export could not read rendered frames.');
  }
  return context;
}

function yieldToBrowser(signal?: AbortSignal): Promise<void> {
  throwIfMotionExportAborted(signal);
  return new Promise((resolve, reject) => {
    let timeoutId = 0;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener('abort', handleAbort);
    };
    const handleAbort = () => {
      cleanup();
      reject(new DOMException('Export canceled.', 'AbortError'));
    };

    timeoutId = window.setTimeout(() => {
      cleanup();
      resolve();
    }, 0);
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

export function createMantleGifExportPlan(
  input: MantleGifExportInput
): MantleGifExportPlan {
  const plan = createMantleMotionExportPlan(input, {
    defaultDurationMs: DEFAULT_GIF_DURATION_MS,
    defaultFrameRate: DEFAULT_GIF_FRAME_RATE,
    label: 'GIF',
    maxDurationMs: GIF_EXPORT_MAX_DURATION_MS,
    maxFrameRate: 24,
    maxFrames: GIF_EXPORT_MAX_FRAMES,
    maxPixelCount: MAX_ANIMATED_GIF_PIXELS,
    maxTotalFramePixels: GIF_EXPORT_MAX_TOTAL_FRAME_PIXELS,
    minFrameRate: 6,
    requestedDurationMs: input.card.export.gifDurationMs
  });

  return {
    ...plan,
    frameDelayMs: 1000 / plan.frameRate,
    mimeType: 'image/gif'
  };
}

export async function exportMantleGif(
  input: MantleGifExportInput
): Promise<ExportResult> {
  const plan = createMantleGifExportPlan(input);
  const { durationMs, frameCount, frameDelayMs, frameRate, mimeType, startMs } = plan;
  const frameIntervalMs = 1000 / frameRate;
  const canvas = document.createElement('canvas');
  throwIfMotionExportAborted(input.signal);
  reportMotionProgress(input, {
    phase: 'preparing',
    progress: 0,
    detail: 'Preparing GIF frames'
  });
  const video =
    input.asset?.mediaKind === 'video'
      ? await createMotionVideoDecoder(input.asset, input.signal)
      : undefined;
  let encoder: ReturnType<typeof createAnimatedGifEncoder> | undefined;

  try {
    for (let index = 0; index < frameCount; index += 1) {
      throwIfMotionExportAborted(input.signal);
      const clipTimeMs = Math.min(
        Math.max(0, durationMs - 1),
        index * frameIntervalMs
      );
      const timeMs = startMs + clipTimeMs;

      await renderMantleMotionFrame({ input, canvas, video, timeMs });
      const context = getReadableCanvasContext(canvas);
      encoder ??= createAnimatedGifEncoder({
        width: canvas.width,
        height: canvas.height,
        loop: input.card.export.gifLoop ?? true,
        loopCount: input.card.export.gifLoopCount ?? 0
      });
      encoder.addFrame(context.getImageData(0, 0, canvas.width, canvas.height), {
        delayMs: frameDelayMs
      });

      reportMotionProgress(input, {
        phase: 'rendering',
        progress: ((index + 1) / frameCount) * 0.96,
        detail: `Rendering GIF frame ${index + 1} of ${frameCount}`
      });
      await yieldToBrowser(input.signal);
    }

    throwIfMotionExportAborted(input.signal);
    reportMotionProgress(input, {
      phase: 'finalizing',
      progress: 0.98,
      detail: 'Encoding GIF'
    });

    if (!encoder) {
      throw new Error('GIF export did not render any frames.');
    }

    const gifBytes = encoder.finish();
    reportMotionProgress(input, {
      phase: 'finalizing',
      progress: 1,
      detail: 'Preparing download'
    });
    return {
      blob: new Blob([bytesToArrayBuffer(gifBytes)], { type: mimeType }),
      filename: resolveMantleExportFileName(input.card, input.asset),
      mimeType
    };
  } finally {
    if (video) {
      video.removeAttribute('src');
      video.load();
    }
  }
}
