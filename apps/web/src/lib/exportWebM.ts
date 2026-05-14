import { resolveMantleExportFileName } from '@mantle/engine/render';
import type {
  ExportResult,
  MantleCard,
  MantleRenderableAsset
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

type SourceAudioCapture = {
  track: MediaStreamTrack;
  start: () => Promise<void>;
  stop: () => void;
};

export type MantleWebMExportInput = MantleMotionExportInput;
export type MantleWebMExportProgress = MantleMotionExportProgress;
export type MantleMp4ExportInput = MantleMotionExportInput;
export type MantleMp4ExportProgress = MantleMotionExportProgress;

type RecordedVideoExportFormat = 'webm' | 'mp4';
type RecordedVideoExportConfig = {
  format: RecordedVideoExportFormat;
  label: string;
  mimeCandidates: string[];
};

const WEBM_MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm'
];
const MP4_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1.4D401F,mp4a.40.2',
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4'
];
const RECORDED_VIDEO_EXPORT_CONFIG: Record<
  RecordedVideoExportFormat,
  RecordedVideoExportConfig
> = {
  webm: {
    format: 'webm',
    label: 'WebM',
    mimeCandidates: WEBM_MIME_CANDIDATES
  },
  mp4: {
    format: 'mp4',
    label: 'MP4',
    mimeCandidates: MP4_MIME_CANDIDATES
  }
};
const DEFAULT_VIDEO_DURATION_MS = 3000;
const DEFAULT_VIDEO_FRAME_RATE = 24;
const DEFAULT_VIDEO_BITRATE_MBPS = 8;
const DEFAULT_AUDIO_BITRATE_BPS = 128_000;
const MAX_VIDEO_EXPORT_PIXELS = 16_000_000;
const MAX_VIDEO_EXPORT_FRAMES = 1800;
const MAX_VIDEO_EXPORT_TOTAL_FRAME_PIXELS = 3_200_000_000;
const VIDEO_FINALIZE_TIMEOUT_MS = 20_000;
const supportedRecordedVideoMimeTypes = new Map<RecordedVideoExportFormat, string>();

export type MantleRecordedVideoExportPlan = MantleMotionExportPlan & {
  format: RecordedVideoExportFormat;
  bitrate: number;
  mimeType: string;
};
export type MantleWebMExportPlan = MantleRecordedVideoExportPlan;
export type MantleMp4ExportPlan = MantleRecordedVideoExportPlan;

function resolveRecordedVideoMimeType(format: RecordedVideoExportFormat): string {
  const cachedMimeType = supportedRecordedVideoMimeTypes.get(format);
  if (cachedMimeType) return cachedMimeType;

  const config = RECORDED_VIDEO_EXPORT_CONFIG[format];
  if (typeof MediaRecorder === 'undefined') {
    throw new Error(`${config.label} export is not supported by this browser.`);
  }

  const mimeType = config.mimeCandidates.find((candidate) =>
    MediaRecorder.isTypeSupported(candidate)
  );

  if (!mimeType) {
    throw new Error(`${config.label} export is not supported by this browser.`);
  }

  supportedRecordedVideoMimeTypes.set(format, mimeType);
  return mimeType;
}

export function isMantleWebMSupported(): boolean {
  try {
    resolveRecordedVideoMimeType('webm');
    return true;
  } catch {
    return false;
  }
}

export function isMantleMp4Supported(): boolean {
  try {
    resolveRecordedVideoMimeType('mp4');
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
  return createMantleRecordedVideoExportPlan(input, 'webm');
}

export function createMantleMp4ExportPlan(
  input: MantleMp4ExportInput
): MantleMp4ExportPlan {
  return createMantleRecordedVideoExportPlan(input, 'mp4');
}

function createMantleRecordedVideoExportPlan(
  input: MantleMotionExportInput,
  format: RecordedVideoExportFormat
): MantleRecordedVideoExportPlan {
  const config = RECORDED_VIDEO_EXPORT_CONFIG[format];
  const mimeType = resolveRecordedVideoMimeType(format);
  const plan = createMantleMotionExportPlan(input, {
    defaultDurationMs: DEFAULT_VIDEO_DURATION_MS,
    defaultFrameRate: DEFAULT_VIDEO_FRAME_RATE,
    label: config.label,
    maxDurationMs: 60000,
    maxFrameRate: 60,
    maxFrames: MAX_VIDEO_EXPORT_FRAMES,
    maxPixelCount: MAX_VIDEO_EXPORT_PIXELS,
    maxTotalFramePixels: MAX_VIDEO_EXPORT_TOTAL_FRAME_PIXELS,
    minFrameRate: 1,
    requestedDurationMs: input.card.export.videoDurationMs
  });

  return {
    ...plan,
    format,
    bitrate: resolveBitrate(input.card),
    mimeType
  };
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfMotionExportAborted(signal);
  if (ms <= 0) return Promise.resolve();
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
    }, ms);
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

function waitUntil(time: number, signal?: AbortSignal): Promise<void> {
  return wait(time - performance.now(), signal);
}

function createRecorder(
  stream: MediaStream,
  plan: MantleRecordedVideoExportPlan,
  hasAudio: boolean
): MediaRecorder {
  try {
    return new MediaRecorder(stream, {
      mimeType: plan.mimeType,
      ...(hasAudio ? { audioBitsPerSecond: DEFAULT_AUDIO_BITRATE_BPS } : {}),
      videoBitsPerSecond: plan.bitrate
    });
  } catch {
    throw new Error(
      `${RECORDED_VIDEO_EXPORT_CONFIG[plan.format].label} export is not supported by this browser.`
    );
  }
}

function collectRecording(
  recorder: MediaRecorder,
  plan: MantleRecordedVideoExportPlan,
  signal?: AbortSignal
): Promise<Blob> {
  const label = RECORDED_VIDEO_EXPORT_CONFIG[plan.format].label;
  return new Promise((resolve, reject) => {
    const chunks: Blob[] = [];

    const cleanup = () => {
      recorder.removeEventListener('dataavailable', handleData);
      recorder.removeEventListener('error', handleError);
      recorder.removeEventListener('stop', handleStop);
      signal?.removeEventListener('abort', handleAbort);
    };
    const handleData = (event: BlobEvent) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const handleError = () => {
      cleanup();
      reject(new Error(`${label} recording failed in this browser.`));
    };
    const handleStop = () => {
      cleanup();
      if (chunks.length === 0) {
        reject(new Error(`${label} recording produced an empty file.`));
        return;
      }

      resolve(new Blob(chunks, { type: plan.mimeType }));
    };
    const handleAbort = () => {
      cleanup();
      reject(new DOMException('Export canceled.', 'AbortError'));
    };

    throwIfMotionExportAborted(signal);
    recorder.addEventListener('dataavailable', handleData);
    recorder.addEventListener('error', handleError, { once: true });
    recorder.addEventListener('stop', handleStop, { once: true });
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  signal?: AbortSignal
): Promise<T> {
  return new Promise((resolve, reject) => {
    throwIfMotionExportAborted(signal);
    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      reject(new Error(message));
    }, timeoutMs);
    const handleAbort = () => {
      window.clearTimeout(timeoutId);
      reject(new DOMException('Export canceled.', 'AbortError'));
    };

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        signal?.removeEventListener('abort', handleAbort);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeoutId);
        signal?.removeEventListener('abort', handleAbort);
        reject(error);
      }
    );
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

function stopRecorder(recorder: MediaRecorder | undefined): void {
  if (!recorder || recorder.state === 'inactive') return;
  recorder.stop();
}

function createCanvasStream(
  canvas: HTMLCanvasElement,
  frameRate: number,
  label: string
): { stream: MediaStream; track: RequestableCanvasTrack; manualFrames: boolean } {
  if (!('captureStream' in canvas)) {
    throw new Error(`${label} export is not supported by this browser.`);
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
    throw new Error(`${label} export is not supported by this browser.`);
  }

  return { stream, track, manualFrames: false };
}

function waitForMediaEvent(
  media: HTMLMediaElement,
  eventName: keyof HTMLMediaElementEventMap,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    throwIfMotionExportAborted(signal);
    let timeoutId = 0;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      media.removeEventListener(eventName, handleEvent);
      media.removeEventListener('error', handleError);
      signal?.removeEventListener('abort', handleAbort);
    };
    const handleEvent = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('Source audio could not be decoded for export.'));
    };
    const handleAbort = () => {
      cleanup();
      reject(new DOMException('Export canceled.', 'AbortError'));
    };

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('Source audio took too long to prepare for export.'));
    }, 15_000);

    media.addEventListener(eventName, handleEvent, { once: true });
    media.addEventListener('error', handleError, { once: true });
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

async function seekMediaElement(
  media: HTMLMediaElement,
  timeMs: number,
  signal?: AbortSignal
): Promise<void> {
  throwIfMotionExportAborted(signal);
  const targetSeconds = Math.max(0, timeMs / 1000);
  const sameTime = Math.abs(media.currentTime - targetSeconds) < 0.002;
  if (sameTime && media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;

  const seeked = sameTime
    ? waitForMediaEvent(media, 'loadeddata', signal)
    : waitForMediaEvent(media, 'seeked', signal);
  if (!sameTime) media.currentTime = targetSeconds;
  await seeked;
  throwIfMotionExportAborted(signal);
}

async function createSourceAudioCapture({
  asset,
  startMs,
  signal
}: {
  asset: MantleRenderableAsset | undefined;
  startMs: number;
  signal?: AbortSignal | undefined;
}): Promise<SourceAudioCapture | undefined> {
  if (asset?.mediaKind !== 'video' || !asset.objectUrl) return undefined;
  if (typeof AudioContext === 'undefined') return undefined;

  const audioContext = new AudioContext();
  const video = document.createElement('video');
  video.playsInline = true;
  video.preload = 'auto';
  video.muted = false;
  video.src = asset.objectUrl;
  video.load();

  const cleanup = () => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    void audioContext.close().catch(() => undefined);
  };

  try {
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      await waitForMediaEvent(video, 'loadedmetadata', signal);
    }
    await seekMediaElement(video, startMs, signal);

    const source = audioContext.createMediaElementSource(video);
    const destination = audioContext.createMediaStreamDestination();
    source.connect(destination);
    const track = destination.stream.getAudioTracks()[0];
    if (!track) {
      source.disconnect();
      cleanup();
      return undefined;
    }

    return {
      track,
      start: async () => {
        throwIfMotionExportAborted(signal);
        if (audioContext.state !== 'running') {
          await audioContext.resume();
        }
        await video.play();
        throwIfMotionExportAborted(signal);
      },
      stop: () => {
        track.stop();
        source.disconnect();
        cleanup();
      }
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}

export async function exportMantleWebM(
  input: MantleWebMExportInput
): Promise<ExportResult> {
  return exportMantleRecordedVideo(input, 'webm');
}

export async function exportMantleMp4(
  input: MantleMp4ExportInput
): Promise<ExportResult> {
  return exportMantleRecordedVideo(input, 'mp4');
}

async function exportMantleRecordedVideo(
  input: MantleMotionExportInput,
  format: RecordedVideoExportFormat
): Promise<ExportResult> {
  const plan = createMantleRecordedVideoExportPlan(input, format);
  const config = RECORDED_VIDEO_EXPORT_CONFIG[format];
  const { durationMs, frameRate, frameCount, startMs } = plan;
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
      ? await createMotionVideoDecoder(input.asset, input.signal)
      : undefined;
  let stream: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;
  let recording: Promise<Blob> | undefined;
  let audioCapture: SourceAudioCapture | undefined;

  try {
    throwIfMotionExportAborted(input.signal);
    await renderMantleMotionFrame({ input, canvas, video, timeMs: startMs });
    const canvasStream = createCanvasStream(canvas, frameRate, config.label);
    stream = canvasStream.stream;
    audioCapture =
      input.card.export.audioEnabled === false
        ? undefined
        : await createSourceAudioCapture({
            asset: input.asset,
            startMs,
            signal: input.signal
          });
    if (audioCapture) stream.addTrack(audioCapture.track);

    recorder = createRecorder(stream, plan, Boolean(audioCapture));
    recording = collectRecording(recorder, plan, input.signal);
    recording.catch(() => undefined);

    try {
      recorder.start(1000);
    } catch {
      throw new Error(`${config.label} recording could not start in this browser.`);
    }
    await audioCapture?.start();
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
        await waitUntil(startedAt + clipTimeMs, input.signal);
        canvasStream.track.requestFrame?.();
      } else {
        await waitUntil(startedAt + clipTimeMs, input.signal);
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
      phase: 'finalizing',
      progress: 0.98,
      detail: `Finalizing ${config.label} in the browser`
    });
    await waitUntil(startedAt + durationMs, input.signal);
    stopRecorder(recorder);

    const blob = await withTimeout(
      recording,
      VIDEO_FINALIZE_TIMEOUT_MS,
      `${config.label} recording took too long to finish. Try a shorter clip, lower FPS, lower bitrate, or a smaller export scale.`,
      input.signal
    );
    reportMotionProgress(input, {
      phase: 'finalizing',
      progress: 1,
      detail: 'Preparing download'
    });
    return {
      blob,
      filename: resolveMantleExportFileName(input.card, input.asset),
      mimeType: plan.mimeType
    };
  } finally {
    stopRecorder(recorder);
    audioCapture?.stop();
    stream?.getTracks().forEach((track) => track.stop());
    if (video) {
      video.removeAttribute('src');
      video.load();
    }
  }
}
