import { renderMantleCardToCanvas } from '@mantle/engine/render';
import type {
  MantleCard,
  MantleRenderableAsset,
  MantleSurfaceTarget
} from '@mantle/schemas/model';
import { useEffect, useRef, useState } from 'react';

import { Icon } from '../../components/Icon';
import styles from './CardCanvas.module.css';
import type {
  PreviewRenderRequestPayload as PreviewWorkerRequest,
  PreviewRenderResponse as PreviewWorkerResponse,
  PreviewRenderResult as PreviewWorkerResult
} from './previewRenderProtocol';

const PREVIEW_MAX_PIXEL_COUNT = 16_000_000;
const PREVIEW_WORKER_PIXEL_THRESHOLD = 900_000;
const HEAVY_PREVIEW_BACKGROUND_IDS = new Set([
  'symbol-wave',
  'aurora-gradient',
  'contour-lines',
  'falling-pattern',
  'marbling',
  'signal-field',
  'smoke-veil'
]);

type CardCanvasProps = {
  card: MantleCard;
  target: MantleSurfaceTarget;
  asset?: MantleRenderableAsset | undefined;
  backgroundAsset?: MantleRenderableAsset | undefined;
  onChooseSource?: () => void;
  onRelinkSource?: () => void;
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
        height: response.height
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
  onChooseSource,
  onRelinkSource
}: CardCanvasProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufferCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewWorkerRef = useRef<PreviewWorkerClient | null>(null);
  const renderSeqRef = useRef(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const hasAssetSource = Boolean(asset?.objectUrl);
  const isMissingSource = Boolean(card.sourceAssetId && !hasAssetSource);

  useEffect(() => {
    return () => {
      previewWorkerRef.current?.dispose();
      previewWorkerRef.current = null;
      releasePreviewBufferCanvas(bufferCanvasRef.current);
      bufferCanvasRef.current = null;
    };
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;

    let cancelled = false;
    const seq = ++renderSeqRef.current;
    let rafId = 0;

    const schedule = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(async () => {
        if (cancelled || seq !== renderSeqRef.current) return;

        const style = window.getComputedStyle(wrap);
        const padX =
          Number.parseFloat(style.paddingLeft || '0') +
          Number.parseFloat(style.paddingRight || '0');
        const padY =
          Number.parseFloat(style.paddingTop || '0') +
          Number.parseFloat(style.paddingBottom || '0');
        const availW = Math.max(0, wrap.clientWidth - padX);
        const availH = Math.max(0, wrap.clientHeight - padY);
        if (availW === 0 || availH === 0) return;

        const aspect = target.width / target.height;
        let cssW = availW;
        let cssH = availW / aspect;
        if (cssH > availH) {
          cssH = availH;
          cssW = availH * aspect;
        }

        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;

        const scale = resolveStablePreviewScale(target);
        const renderPayload: PreviewWorkerRequest = {
          card,
          target,
          asset,
          backgroundAsset,
          scale,
          showEmptyPlaceholderText: hasAssetSource
        };

        const drawBitmap = (bitmap: CanvasImageSource, width: number, height: number) => {
          if (canvas.width !== width) canvas.width = width;
          if (canvas.height !== height) canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas 2D context is unavailable.');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, 0, 0);
        };

        try {
          let renderedInWorker = false;

          if (!shouldUsePreviewWorker(card, target, scale)) {
            previewWorkerRef.current?.dispose();
            previewWorkerRef.current = null;
          } else {
            releasePreviewBufferCanvas(bufferCanvasRef.current);
            bufferCanvasRef.current = null;

            const workerClient =
              previewWorkerRef.current ?? createPreviewWorkerClient();
            previewWorkerRef.current = workerClient;

            try {
              const rendered = await workerClient.render(renderPayload);
              try {
                if (cancelled || seq !== renderSeqRef.current) {
                  return;
                }

                drawBitmap(rendered.bitmap, rendered.width, rendered.height);
                renderedInWorker = true;
              } finally {
                rendered.bitmap.close();
              }
            } catch (workerError) {
              const previewError = toPreviewRenderFailure(workerError);
              if (
                isPreviewRenderCancelled(previewError) ||
                cancelled ||
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
            const rendered = await renderMantleCardToCanvas({
              ...renderPayload,
              canvas: bufferCanvas,
              renderMode: 'preview'
            });
            if (cancelled || seq !== renderSeqRef.current) return;

            drawBitmap(rendered, rendered.width, rendered.height);
          }

          setRenderError(null);
        } catch (error) {
          if (cancelled || seq !== renderSeqRef.current) return;
          setRenderError(toPreviewRenderFailure(error).message);
        }
      });
    };

    schedule();

    const resize = new ResizeObserver(schedule);
    resize.observe(wrap);

    return () => {
      cancelled = true;
      renderSeqRef.current += 1;
      cancelAnimationFrame(rafId);
      resize.disconnect();
    };
  }, [card, target, asset, backgroundAsset, hasAssetSource]);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <canvas
        className={styles.canvas}
        ref={canvasRef}
        // Canvas starts hidden until JS measures the wrapper. Prevents the
        // intrinsic canvas size (width attribute) from forcing parent growth.
        style={{ width: 0, height: 0 }}
      />
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
                  {isMissingSource ? 'Source image missing' : 'Drop a screenshot'}
                </span>
                <span className={styles.emptySub}>
                  {isMissingSource
                    ? `${asset?.name ?? 'Saved source'} was not embedded in this project file.`
                    : 'Start with an image to compose a social-ready card'}
                </span>
              </div>
            </div>
            <ol className={styles.emptyHints}>
              <li>
                <span className={styles.emptyHintKey}>Drop</span>
                <span>
                  {isMissingSource
                    ? 'the original image anywhere to relink'
                    : 'image anywhere on the workspace'}
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
                  <span>{isMissingSource ? 'Relink image' : 'Choose image'}</span>
                </button>
                <span className={styles.emptyHintAside}>
                  PNG, JPG, WebP
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
