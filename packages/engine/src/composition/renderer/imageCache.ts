export type LoadedMantleImage = HTMLImageElement | ImageBitmap;

type CachedMantleImage = {
  sourceUrl: string;
  promise: Promise<LoadedMantleImage>;
  image?: LoadedMantleImage | undefined;
  refCount: number;
  evicted: boolean;
};

type PendingCachedMantleImage = Omit<CachedMantleImage, 'promise'> & {
  promise?: Promise<LoadedMantleImage> | undefined;
};

const IMAGE_CACHE_MAX_ENTRIES = 12;
const IMAGE_CACHE = new Map<string, CachedMantleImage>();

function closeLoadedImage(image: LoadedMantleImage | undefined): void {
  if (image && 'close' in image && typeof image.close === 'function') {
    image.close();
  }
}

function disposeEvictedImageCacheEntry(entry: PendingCachedMantleImage): void {
  if (!entry.evicted || entry.refCount > 0 || !entry.image) return;
  closeLoadedImage(entry.image);
  entry.image = undefined;
}

function evictImageCacheEntry(entry: CachedMantleImage): void {
  entry.evicted = true;
  IMAGE_CACHE.delete(entry.sourceUrl);
  void entry.promise.then(
    () => disposeEvictedImageCacheEntry(entry),
    () => undefined
  );
}

function cacheImage(sourceUrl: string, entry: CachedMantleImage): void {
  if (IMAGE_CACHE.size >= IMAGE_CACHE_MAX_ENTRIES) {
    const oldestKey = IMAGE_CACHE.keys().next().value;
    const oldestEntry = oldestKey ? IMAGE_CACHE.get(oldestKey) : undefined;
    if (oldestEntry) evictImageCacheEntry(oldestEntry);
  }
  IMAGE_CACHE.set(sourceUrl, entry);
}

export function clearMantleImageCache(sourceUrl?: string): void {
  if (sourceUrl) {
    const entry = IMAGE_CACHE.get(sourceUrl);
    if (entry) evictImageCacheEntry(entry);
    return;
  }

  Array.from(IMAGE_CACHE.values()).forEach(evictImageCacheEntry);
}

function hasImageLoadPromise(
  entry: PendingCachedMantleImage
): entry is CachedMantleImage {
  return entry.promise !== undefined;
}

function toImageLoadError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Could not load image asset.');
}

async function loadCachedMantleImage(
  sourceUrl: string,
  entry: PendingCachedMantleImage
): Promise<LoadedMantleImage> {
  try {
    let image: LoadedMantleImage;
    if (typeof Image !== 'undefined') {
      image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.addEventListener('load', () => resolve(element));
        element.addEventListener('error', () => {
          reject(new Error('Could not decode image.'));
        });
        element.src = sourceUrl;
      });
    } else {
      if (typeof createImageBitmap === 'undefined') {
        throw new Error('Image decoding is not available in this environment.');
      }

      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error('Could not load image asset.');
      image = await createImageBitmap(await response.blob());
    }

    entry.image = image;
    disposeEvictedImageCacheEntry(entry);
    return image;
  } catch (error) {
    if (IMAGE_CACHE.get(sourceUrl) === entry) {
      IMAGE_CACHE.delete(sourceUrl);
    }
    throw toImageLoadError(error);
  }
}

function createImageCacheEntry(sourceUrl: string): CachedMantleImage {
  const entry: PendingCachedMantleImage = {
    sourceUrl,
    refCount: 0,
    evicted: false
  };

  entry.promise = loadCachedMantleImage(sourceUrl, entry);
  if (!hasImageLoadPromise(entry)) {
    throw new Error('Image cache entry was created without a load promise.');
  }

  return entry;
}

function retainImageCacheEntry(sourceUrl: string): CachedMantleImage {
  const cached = IMAGE_CACHE.get(sourceUrl);
  const entry = cached ?? createImageCacheEntry(sourceUrl);
  if (!cached) cacheImage(sourceUrl, entry);
  entry.refCount += 1;
  return entry;
}

function releaseImageCacheEntry(entry: CachedMantleImage): void {
  entry.refCount = Math.max(0, entry.refCount - 1);
  disposeEvictedImageCacheEntry(entry);
}

export async function withLoadedImage<T>(
  sourceUrl: string,
  useImage: (image: LoadedMantleImage) => T | Promise<T>
): Promise<T> {
  const entry = retainImageCacheEntry(sourceUrl);
  try {
    const image = await entry.promise;
    return await useImage(image);
  } finally {
    releaseImageCacheEntry(entry);
  }
}
