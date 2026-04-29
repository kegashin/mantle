import type {
  MantleSourceCrop,
  MantleSourceFocus,
  MantleSourcePlacement
} from '@mantle/schemas/model';

import type { Rect } from '../types';

const MIN_SOURCE_CROP_SIZE = 0.01;
export const SOURCE_PLACEMENT_ZOOM_MIN = 1;
export const SOURCE_PLACEMENT_ZOOM_MAX = 4;

export type SourceImageDrawPlan = {
  sourceRect: Rect;
  destinationRect: Rect;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function imageDimensions(sourceWidth: number, sourceHeight: number): {
  width: number;
  height: number;
} {
  return {
    width: Math.max(1, sourceWidth),
    height: Math.max(1, sourceHeight)
  };
}

function normalizeCrop(crop: MantleSourceCrop): MantleSourceCrop {
  const width = clamp(crop.width, MIN_SOURCE_CROP_SIZE, 1);
  const height = clamp(crop.height, MIN_SOURCE_CROP_SIZE, 1);

  return {
    x: clamp(crop.x, 0, 1 - width),
    y: clamp(crop.y, 0, 1 - height),
    width,
    height
  };
}

function normalizeFocus(focus: MantleSourceFocus | undefined): MantleSourceFocus {
  return {
    x: clamp(focus?.x ?? 0.5, 0, 1),
    y: clamp(focus?.y ?? 0.5, 0, 1)
  };
}

function normalizeZoom(zoom: number | undefined): number {
  return clamp(
    zoom ?? SOURCE_PLACEMENT_ZOOM_MIN,
    SOURCE_PLACEMENT_ZOOM_MIN,
    SOURCE_PLACEMENT_ZOOM_MAX
  );
}

function cropToSourceRect(
  crop: MantleSourceCrop,
  sourceWidth: number,
  sourceHeight: number
): Rect {
  const normalized = normalizeCrop(crop);
  return {
    x: normalized.x * sourceWidth,
    y: normalized.y * sourceHeight,
    width: normalized.width * sourceWidth,
    height: normalized.height * sourceHeight
  };
}

export function resolveCoverSourceCrop({
  sourceWidth,
  sourceHeight,
  destinationWidth,
  destinationHeight
}: {
  sourceWidth: number;
  sourceHeight: number;
  destinationWidth: number;
  destinationHeight: number;
}): MantleSourceCrop {
  const sourceAspect = Math.max(0.01, sourceWidth / sourceHeight);
  const destinationAspect = Math.max(0.01, destinationWidth / destinationHeight);

  if (sourceAspect > destinationAspect) {
    const width = clamp(destinationAspect / sourceAspect, MIN_SOURCE_CROP_SIZE, 1);
    return normalizeCrop({
      x: (1 - width) / 2,
      y: 0,
      width,
      height: 1
    });
  }

  const height = clamp(sourceAspect / destinationAspect, MIN_SOURCE_CROP_SIZE, 1);
  return normalizeCrop({
    x: 0,
    y: (1 - height) / 2,
    width: 1,
    height
  });
}

export function resolveSourceCropFocus(
  crop: MantleSourceCrop | undefined
): MantleSourceFocus {
  const normalized = normalizeCrop(crop ?? { x: 0, y: 0, width: 1, height: 1 });
  return {
    x: normalized.x + normalized.width / 2,
    y: normalized.y + normalized.height / 2
  };
}

export function resolveSourceCropZoom(
  crop: MantleSourceCrop,
  coverCrop: MantleSourceCrop
): number {
  const normalizedCrop = normalizeCrop(crop);
  const normalizedCoverCrop = normalizeCrop(coverCrop);
  return normalizeZoom(
    Math.min(
      normalizedCoverCrop.width / normalizedCrop.width,
      normalizedCoverCrop.height / normalizedCrop.height
    )
  );
}

export function resolveSourceCropFromFocus({
  coverCrop,
  focus,
  zoom
}: {
  coverCrop: MantleSourceCrop;
  focus?: MantleSourceFocus | undefined;
  zoom?: number | undefined;
}): MantleSourceCrop {
  const normalizedCoverCrop = normalizeCrop(coverCrop);
  const normalizedFocus = normalizeFocus(focus);
  const normalizedZoom = normalizeZoom(zoom);
  const width = clamp(
    normalizedCoverCrop.width / normalizedZoom,
    MIN_SOURCE_CROP_SIZE,
    normalizedCoverCrop.width
  );
  const height = clamp(
    normalizedCoverCrop.height / normalizedZoom,
    MIN_SOURCE_CROP_SIZE,
    normalizedCoverCrop.height
  );

  return normalizeCrop({
    x: normalizedFocus.x - width / 2,
    y: normalizedFocus.y - height / 2,
    width,
    height
  });
}

export function resolveSourceCropForContent({
  placement,
  sourceWidth,
  sourceHeight,
  destinationWidth,
  destinationHeight
}: {
  placement?: MantleSourcePlacement | undefined;
  sourceWidth: number;
  sourceHeight: number;
  destinationWidth: number;
  destinationHeight: number;
}): MantleSourceCrop {
  const source = imageDimensions(sourceWidth, sourceHeight);
  const coverCrop = resolveCoverSourceCrop({
    sourceWidth: source.width,
    sourceHeight: source.height,
    destinationWidth,
    destinationHeight
  });

  if (placement?.mode === 'crop') {
    if (placement.focus && placement.zoom != null) {
      return resolveSourceCropFromFocus({
        coverCrop,
        focus: placement.focus,
        zoom: placement.zoom
      });
    }

    if (placement.crop) {
      const normalizedCrop = normalizeCrop(placement.crop);
      return resolveSourceCropFromFocus({
        coverCrop,
        focus: resolveSourceCropFocus(normalizedCrop),
        zoom: resolveSourceCropZoom(normalizedCrop, coverCrop)
      });
    }
  }

  return coverCrop;
}

export function resolveSourceImageDrawPlan({
  placement,
  sourceWidth,
  sourceHeight,
  contentRect
}: {
  placement?: MantleSourcePlacement | undefined;
  sourceWidth: number;
  sourceHeight: number;
  contentRect: Rect;
}): SourceImageDrawPlan {
  const source = imageDimensions(sourceWidth, sourceHeight);
  const mode = placement?.mode ?? 'fit';

  if (mode === 'fit') {
    const scale = Math.min(
      contentRect.width / source.width,
      contentRect.height / source.height
    );
    const destinationWidth = source.width * scale;
    const destinationHeight = source.height * scale;

    return {
      sourceRect: {
        x: 0,
        y: 0,
        width: source.width,
        height: source.height
      },
      destinationRect: {
        x: contentRect.x + (contentRect.width - destinationWidth) / 2,
        y: contentRect.y + (contentRect.height - destinationHeight) / 2,
        width: destinationWidth,
        height: destinationHeight
      }
    };
  }

  const crop = resolveSourceCropForContent({
    placement,
    sourceWidth: source.width,
    sourceHeight: source.height,
    destinationWidth: contentRect.width,
    destinationHeight: contentRect.height
  });

  return {
    sourceRect: cropToSourceRect(crop, source.width, source.height),
    destinationRect: contentRect
  };
}
