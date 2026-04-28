import {
  renderMantleCardToCanvas,
  transferCanvasToImageBitmap
} from '@mantle/engine/render';
import type {
  PreviewRenderFailurePhase,
  PreviewRenderRequest,
  PreviewRenderResponse
} from './previewRenderProtocol';

type PreviewRenderWorkerScope = typeof self & {
  onmessage: ((event: MessageEvent<PreviewRenderRequest>) => void) | null;
  postMessage: (message: PreviewRenderResponse, transfer?: Transferable[]) => void;
};

function isPreviewRenderWorkerScope(
  candidate: typeof self
): candidate is PreviewRenderWorkerScope {
  return typeof candidate.postMessage === 'function';
}

const scope = self;
if (!isPreviewRenderWorkerScope(scope)) {
  throw new Error('Preview render worker scope is unavailable.');
}

const canvas = new OffscreenCanvas(1, 1);

type PreviewRenderWorkerFailure = Readonly<{
  message: string;
}>;

function toPreviewRenderWorkerFailure(
  error: unknown,
  fallback: string
): PreviewRenderWorkerFailure {
  return error instanceof Error ? error : new Error(fallback);
}

function postFailure(
  id: number,
  phase: PreviewRenderFailurePhase,
  error: PreviewRenderWorkerFailure
): void {
  scope.postMessage({
    id,
    ok: false,
    phase,
    error: error.message || 'Worker render failed.'
  });
}

scope.onmessage = async (event) => {
  const request = event.data;
  let bitmap: ImageBitmap | undefined;

  try {
    await renderMantleCardToCanvas({
      card: request.card,
      target: request.target,
      asset: request.asset,
      backgroundAsset: request.backgroundAsset,
      canvas,
      renderMode: 'preview',
      scale: request.scale,
      showEmptyPlaceholderText: request.showEmptyPlaceholderText
    });
  } catch (error) {
    postFailure(
      request.id,
      'render',
      toPreviewRenderWorkerFailure(error, 'Worker render failed.')
    );
    return;
  }

  try {
    bitmap = await transferCanvasToImageBitmap(canvas);

    scope.postMessage(
      {
        id: request.id,
        ok: true,
        bitmap,
        width: canvas.width,
        height: canvas.height
      },
      [bitmap]
    );
    bitmap = undefined;
  } catch (error) {
    bitmap?.close();
    postFailure(
      request.id,
      'transfer',
      toPreviewRenderWorkerFailure(error, 'Worker transfer failed.')
    );
  }
};
