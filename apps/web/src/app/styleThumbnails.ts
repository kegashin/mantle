import { createMantlePreviewRenderer } from '@mantle/engine/render';
import { createMantleCard } from '@mantle/schemas/defaults';
import type {
  MantleCard,
  MantleFrame,
  MantleSurfaceTarget
} from '@mantle/schemas/model';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react';

import {
  cloneBackground,
  type StylePreset
} from './stylePresets';

export type StyleThumbnailSource = Pick<
  StylePreset,
  'id' | 'label' | 'background'
>;

export type StyleThumbnailState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  url?: string | undefined;
};

export type StyleThumbnailMap = Record<string, StyleThumbnailState>;

type CacheEntry = StyleThumbnailState & {
  key: string;
};

type ThumbnailRequest = {
  id: string;
  key: string;
  source: StyleThumbnailSource;
};

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const THUMBNAIL_TARGET: MantleSurfaceTarget = {
  id: 'style-thumbnail',
  kind: 'custom',
  label: 'Style thumbnail',
  width: 1600,
  height: 900,
  platform: 'custom',
  aspectRatioPresetId: '16:9'
};
const THUMBNAIL_SCALE = 0.12;
const THUMBNAIL_MIME_TYPE = 'image/webp';
const THUMBNAIL_QUALITY = 0.82;
const THUMBNAIL_FRAME: MantleFrame = {
  preset: 'none',
  boxStyle: 'none',
  padding: 0,
  contentPadding: 0,
  cornerRadius: 0,
  shadowStrength: 0,
  alignment: 'center'
};
const thumbnailSessionCache = new Map<string, CacheEntry>();

function sortStable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortStable);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortStable(entry)])
  );
}

function stableKey(value: unknown): string {
  return JSON.stringify(sortStable(value));
}

function styleThumbnailKey(source: StyleThumbnailSource): string {
  return stableKey({
    version: 5,
    id: source.id,
    background: source.background
  });
}

function scheduleLowPriority(callback: () => void): () => void {
  const idleWindow = window as IdleWindow;
  let cancelled = false;
  let cancelScheduled: (() => void) | undefined;

  const runWhenVisible = () => {
    if (cancelled) return;
    if (document.visibilityState === 'hidden') {
      cancelScheduled = scheduleLowPriority(callback);
      return;
    }
    callback();
  };

  if (document.visibilityState === 'hidden') {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') return;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (!cancelled) cancelScheduled = scheduleLowPriority(callback);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelScheduled?.();
    };
  }

  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(runWhenVisible, { timeout: 250 });
    return () => {
      cancelled = true;
      idleWindow.cancelIdleCallback?.(handle);
      cancelScheduled?.();
    };
  }

  const handle = window.setTimeout(runWhenVisible, 16);
  return () => {
    cancelled = true;
    window.clearTimeout(handle);
    cancelScheduled?.();
  };
}

function createThumbnailCard(source: StyleThumbnailSource): MantleCard {
  const card = createMantleCard({
    id: `style-thumbnail-${source.id}`,
    name: source.label,
    targetId: THUMBNAIL_TARGET.id
  });

  return {
    ...card,
    themeId: source.id,
    background: cloneBackground(source.background),
    frame: { ...THUMBNAIL_FRAME },
    text: {
      ...card.text,
      placement: 'none'
    },
    textLayers: undefined,
    activeTextLayerId: undefined,
    export: {
      ...card.export,
      scale: 1,
      format: 'webp'
    }
  };
}

function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({
      type: THUMBNAIL_MIME_TYPE,
      quality: THUMBNAIL_QUALITY
    });
  }

  if ('toBlob' in canvas && typeof canvas.toBlob === 'function') {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Style thumbnail could not be encoded.'));
          }
        },
        THUMBNAIL_MIME_TYPE,
        THUMBNAIL_QUALITY
      );
    });
  }

  return Promise.reject(new Error('Style thumbnail canvas cannot be encoded.'));
}

function entryForCache(entry: CacheEntry | undefined): StyleThumbnailState {
  if (!entry) return { status: 'idle' };
  return {
    status: entry.status,
    url: entry.url
  };
}

function thumbnailStatesEqual(
  left: StyleThumbnailState | undefined,
  right: StyleThumbnailState | undefined
): boolean {
  return (left?.status ?? 'idle') === (right?.status ?? 'idle') && left?.url === right?.url;
}

function thumbnailMapsEqual(
  left: StyleThumbnailMap,
  right: StyleThumbnailMap
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  return rightKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(left, key) &&
      thumbnailStatesEqual(left[key], right[key])
  );
}

function buildThumbnailMap(
  requests: readonly ThumbnailRequest[],
  cache: ReadonlyMap<string, CacheEntry>
): StyleThumbnailMap {
  return Object.fromEntries(
    requests.map((request) => [
      request.id,
      entryForCache(cache.get(request.id))
    ])
  );
}

function revokeEntry(entry: CacheEntry | undefined): void {
  if (entry?.url) URL.revokeObjectURL(entry.url);
}

function publishThumbnailMap(
  requests: readonly ThumbnailRequest[],
  cache: ReadonlyMap<string, CacheEntry>,
  setSnapshot: Dispatch<SetStateAction<StyleThumbnailMap>>
): void {
  const nextSnapshot = buildThumbnailMap(requests, cache);
  setSnapshot((currentSnapshot) =>
    thumbnailMapsEqual(currentSnapshot, nextSnapshot)
      ? currentSnapshot
      : nextSnapshot
  );
}

export function useStyleThumbnails(
  sources: readonly StyleThumbnailSource[]
): StyleThumbnailMap {
  const rendererRef = useRef<ReturnType<typeof createMantlePreviewRenderer> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cacheRef = useRef<Map<string, CacheEntry>>(thumbnailSessionCache);
  const [snapshot, setSnapshot] = useState<StyleThumbnailMap>({});

  const requests = useMemo<ThumbnailRequest[]>(
    () =>
      sources.map((source) => ({
        id: source.id,
        key: styleThumbnailKey(source),
        source
      })),
    [sources]
  );
  const requestSignature = useMemo(
    () => JSON.stringify(requests.map(({ id, key }) => [id, key])),
    [requests]
  );

  useEffect(() => {
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
      if (canvasRef.current) {
        canvasRef.current.width = 1;
        canvasRef.current.height = 1;
        canvasRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (requests.length === 0) {
      setSnapshot({});
      return undefined;
    }

    const cache = cacheRef.current;
    requests.forEach((request) => {
      const entry = cache.get(request.id);
      if (entry && entry.key !== request.key) {
        revokeEntry(entry);
        cache.delete(request.id);
      }
    });
    publishThumbnailMap(requests, cache, setSnapshot);

    const queue = requests.filter((request) => {
      const entry = cache.get(request.id);
      return !entry || entry.status === 'error';
    });
    if (queue.length === 0) return undefined;

    let cancelled = false;
    let cancelScheduled: (() => void) | undefined;

    const renderNext = () => {
      if (cancelled) return;
      const request = queue.shift();
      if (!request) return;

      const current = cache.get(request.id);
      if (current?.status === 'ready' && current.key === request.key) {
        cancelScheduled = scheduleLowPriority(renderNext);
        return;
      }

      cache.set(request.id, {
        key: request.key,
        status: 'loading'
      });
      publishThumbnailMap(requests, cache, setSnapshot);

      void (async () => {
        const renderer =
          rendererRef.current ?? createMantlePreviewRenderer();
        rendererRef.current = renderer;

        const canvas = canvasRef.current ?? document.createElement('canvas');
        canvasRef.current = canvas;

        const rendered = await renderer.render({
          card: createThumbnailCard(request.source),
          target: THUMBNAIL_TARGET,
          scale: THUMBNAIL_SCALE,
          canvas,
          renderMode: 'preview',
          renderFrameSurface: false,
          showEmptyPlaceholderText: false,
          timeMs: 0
        });
        const blob = await canvasToBlob(rendered.canvas);
        const url = URL.createObjectURL(blob);

        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }

        revokeEntry(cache.get(request.id));
        cache.set(request.id, {
          key: request.key,
          status: 'ready',
          url
        });
        publishThumbnailMap(requests, cache, setSnapshot);
      })()
        .catch(() => {
          if (cancelled) return;
          revokeEntry(cache.get(request.id));
          cache.set(request.id, {
            key: request.key,
            status: 'error'
          });
          publishThumbnailMap(requests, cache, setSnapshot);
        })
        .finally(() => {
          if (!cancelled) {
            cancelScheduled = scheduleLowPriority(renderNext);
          }
        });
    };

    cancelScheduled = scheduleLowPriority(renderNext);

    return () => {
      cancelled = true;
      cancelScheduled?.();
      requests.forEach((request) => {
        const entry = cache.get(request.id);
        if (entry?.status === 'loading') cache.delete(request.id);
      });
    };
  }, [requestSignature, requests]);

  return snapshot;
}
