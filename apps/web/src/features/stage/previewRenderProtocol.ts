import type {
  MantleCard,
  MantleRenderableAsset,
  MantleSurfaceTarget
} from '@mantle/schemas/model';

export type PreviewRenderRequestPayload = {
  card: MantleCard;
  target: MantleSurfaceTarget;
  asset?: MantleRenderableAsset | undefined;
  backgroundAsset?: MantleRenderableAsset | undefined;
  scale: number;
  timeMs?: number | undefined;
  showEmptyPlaceholderText: boolean;
  hiddenTextLayerIds?: string[] | undefined;
};

export type PreviewRenderRequest = PreviewRenderRequestPayload & {
  id: number;
};

export type PreviewRenderResult = {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  contentRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  contentRadius: number;
  contentCornerStyle: 'all' | 'bottom' | 'none';
  frameRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  baseFrameRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  frameRotation: number;
  textRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | undefined;
  textRotation: number;
  textLayerRects?: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  }> | undefined;
};

export type PreviewRenderFailurePhase = 'render' | 'transfer';

export type PreviewRenderResponse =
  | (PreviewRenderResult & {
      id: number;
      ok: true;
    })
  | {
      id: number;
      ok: false;
      phase: PreviewRenderFailurePhase;
      error: string;
    };
