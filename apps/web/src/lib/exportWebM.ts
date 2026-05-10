import { resolveMantleExportFileName } from '@mantle/engine/render';
import type {
  ExportResult,
  MantleCard
} from '@mantle/schemas/model';

import {
  clampNumber,
  createMantleMotionExportPlan,
  createMotionVideoDecoder,
  renderMantleMotionFrame,
  reportMotionProgress,
  throwIfMotionExportAborted,
  type MantleMotionExportInput,
  type MantleMotionExportPlan,
  type MantleMotionExportProgress
} from './motionExportCore';

type RequestableCanvasTrack = MediaStreamTrack & {
  requestFrame?: () => void;
};

export type MantleWebMExportInput = MantleMotionExportInput;
export type MantleWebMExportProgress = MantleMotionExportProgress;

const WEBM_MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm'
];
const DEFAULT_VIDEO_DURATION_MS = 3000;
const DEFAULT_VIDEO_FRAME_RATE = 24;
const DEFAULT_VIDEO_BITRATE_MBPS = 8;
const MAX_VIDEO_EXPORT_PIXELS = 16_000_000;
const MAX_VIDEO_EXPORT_FRAMES = 1800;

export type MantleWebMExportPlan = MantleMotionExportPlan & {
  bitrate: number;
  mimeType: string;
};

function resolveWebMMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('WebM export is not supported by this browser.');
  }

  const mimeType = WEBM_MIME_CANDIDATES.find((candidate) =>
    MediaRecorder.isTypeSupported(candidate)
  );

  if (!mimeType) {
    throw new Error('WebM export is not supported by this browser.');
  }

  return mimeType;
}

export function isMantleWebMSupported(): boolean {
  try {
    resolveWebMMimeType();
    return true;
  } catch {
    return false;
  }
}

function resolveBitrate(card: MantleCard): number {
  return Math.round(
    clampNumber(card.export.videoBitrateMbps ?? DEFAULT_VIDEO_BITRATE_MBPS, 0.5, 40) *
      1_000_000
  );
}

export function createMantleWebMExportPlan(
  input: MantleWebMExportInput
): MantleWebMExportPlan {
  const mimeType = resolveWebMMimeType();
  const plan = createMantleMotionExportPlan(input, {
    defaultDurationMs: DEFAULT_VIDEO_DURATION_MS,
    defaultFrameRate: DEFAULT_VIDEO_FRAME_RATE,
    label: 'WebM',
    maxDurationMs: 60000,
    maxFrameRate: 60,
    maxFrames: MAX_VIDEO_EXPORT_FRAMES,
    maxPixelCount: MAX_VIDEO_EXPORT_PIXELS,
    minFrameRate: 1,
    requestedDurationMs: input.card.export.videoDurationMs
  });

  return {
    ...plan,
    bitrate: resolveBitrate(input.card),
    mimeType
  };
}

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function waitUntil(time: number): Promise<void> {
  return wait(time - performance.now());
}

function createRecorder(stream: MediaStream, mimeType: string, bitrate: number): MediaRecorder {
  try {
    return new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: bitrate
    });
  } catch {
    throw new Error('WebM export is not supported by this browser.');
  }
}

function collectRecording(recorder: MediaRecorder, mimeType: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const chunks: Blob[] = [];

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener('error', () => {
      reject(new Error('WebM recording failed.'));
    });
    recorder.addEventListener('stop', () => {
      if (chunks.length === 0) {
        reject(new Error('WebM recording produced an empty file.'));
        return;
      }

      resolve(new Blob(chunks, { type: mimeType }));
    });
  });
}

function createCanvasStream(
  canvas: HTMLCanvasElement,
  frameRate: number
): { stream: MediaStream; track: RequestableCanvasTrack; manualFrames: boolean } {
  if (!('captureStream' in canvas)) {
    throw new Error('WebM export is not supported by this browser.');
  }

  const manualStream = canvas.captureStream(0);
  const manualTrack = manualStream.getVideoTracks()[0] as
    | RequestableCanvasTrack
    | undefined;

  if (manualTrack?.requestFrame) {
    return {
      stream: manualStream,
      track: manualTrack,
      manualFrames: true
    };
  }

  manualStream.getTracks().forEach((track) => track.stop());

  const stream = canvas.captureStream(frameRate);
  const track = stream.getVideoTracks()[0] as RequestableCanvasTrack | undefined;
  if (!track) {
    throw new Error('WebM export is not supported by this browser.');
  }

  return { stream, track, manualFrames: false };
}

export async function exportMantleWebM(
  input: MantleWebMExportInput
): Promise<ExportResult> {
  const plan = createMantleWebMExportPlan(input);
  const { mimeType, durationMs, frameRate, frameCount, startMs } = plan;
  const frameIntervalMs = 1000 / frameRate;
  const canvas = document.createElement('canvas');
  throwIfMotionExportAborted(input.signal);
  reportMotionProgress(input, {
    phase: 'preparing',
    progress: 0,
    detail: 'Preparing video source'
  });
  const video =
    input.asset?.mediaKind === 'video'
      ? await createMotionVideoDecoder(input.asset)
      : undefined;
  let stream: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;

  try {
    throwIfMotionExportAborted(input.signal);
    await renderMantleMotionFrame({ input, canvas, video, timeMs: startMs });
    const canvasStream = createCanvasStream(canvas, frameRate);
    stream = canvasStream.stream;

    recorder = createRecorder(stream, mimeType, plan.bitrate);
    const recording = collectRecording(recorder, mimeType);

    recorder.start(1000);
    const startedAt = performance.now();
    if (canvasStream.manualFrames) canvasStream.track.requestFrame?.();
    reportMotionProgress(input, {
      phase: 'rendering',
      progress: 1 / frameCount,
      detail: `Rendering frame 1 of ${frameCount}`
    });

    for (let index = 1; index < frameCount; index += 1) {
      throwIfMotionExportAborted(input.signal);
      const clipTimeMs = Math.min(durationMs, index * frameIntervalMs);
      const timeMs = startMs + clipTimeMs;

      if (canvasStream.manualFrames) {
        await renderMantleMotionFrame({ input, canvas, video, timeMs });
        await waitUntil(startedAt + clipTimeMs);
        canvasStream.track.requestFrame?.();
      } else {
        await waitUntil(startedAt + clipTimeMs);
        await renderMantleMotionFrame({ input, canvas, video, timeMs });
      }

      reportMotionProgress(input, {
        phase: 'rendering',
        progress: (index + 1) / frameCount,
        detail: `Rendering frame ${index + 1} of ${frameCount}`
      });
    }

    throwIfMotionExportAborted(input.signal);
    reportMotionProgress(input, {
      phase: 'recording',
      progress: 1,
      detail: 'Finishing WebM recording'
    });
    await waitUntil(startedAt + durationMs);
    if (recorder.state !== 'inactive') recorder.stop();

    const blob = await recording;
    reportMotionProgress(input, {
      phase: 'finalizing',
      progress: 1,
      detail: 'Preparing download'
    });
    return {
      blob,
      filename: resolveMantleExportFileName(input.card, input.asset),
      mimeType
    };
  } finally {
    if (recorder?.state && recorder.state !== 'inactive') {
      recorder.stop();
    }
    stream?.getTracks().forEach((track) => track.stop());
    if (video) {
      video.removeAttribute('src');
      video.load();
    }
  }
}
