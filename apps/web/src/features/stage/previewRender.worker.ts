import {
  createMantlePreviewRenderer,
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
const renderer = createMantlePreviewRenderer();

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
  let rendered:
    | Awaited<ReturnType<typeof renderer.render>>
    | undefined;

  try {
    rendered = await renderer.render({
      card: request.card,
      target: request.target,
      asset: request.asset,
      backgroundAsset: request.backgroundAsset,
      canvas,
      renderMode: 'preview',
      scale: request.scale,
      showEmptyPlaceholderText: request.showEmptyPlaceholderText,
      hiddenTextLayerIds: request.hiddenTextLayerIds
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
    const contentRect = rendered?.contentRect ?? {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height
    };
    const frameRect = rendered?.frameRect ?? contentRect;
    const baseFrameRect = rendered?.baseFrameRect ?? frameRect;

    scope.postMessage(
      {
        id: request.id,
        ok: true,
        bitmap,
        width: canvas.width,
        height: canvas.height,
        contentRect,
        frameRect,
        baseFrameRect,
        frameRotation: rendered?.frameRotation ?? 0,
        textRect: rendered?.textRect,
        textRotation: rendered?.textRotation ?? 0,
        textLayerRects: rendered?.textLayerRects
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
