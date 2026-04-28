import type { MantleAsset, MantleCard } from '@mantle/schemas/model';

import { resolveFrameBoxStyle } from '../frames';
import type { Rect } from '../types';

function getFrameChromeReservedSpace(
  framePreset: MantleCard['frame']['preset'],
  boxStyle: ReturnType<typeof resolveFrameBoxStyle>,
  cardWidth: number,
  contentPadding: number
): { x: number; y: number } {
  const chromePreset = framePreset;
  const hasBox = boxStyle !== 'none';
  const hasChrome = chromePreset !== 'none';
  const outerInset = hasBox && hasChrome ? contentPadding * 2 : 0;
  const innerPadding = hasBox && !hasChrome ? contentPadding * 2 : 0;

  if (
    chromePreset === 'macos-window' ||
    chromePreset === 'minimal-browser' ||
    chromePreset === 'terminal-window' ||
    chromePreset === 'windows-window'
  ) {
    const minimum =
      chromePreset === 'minimal-browser' ? 44 : chromePreset === 'macos-window' ? 36 : 32;
    const headerHeight = Math.max(minimum, Math.round(cardWidth * 0.028));
    return {
      x: outerInset + innerPadding,
      y: outerInset + headerHeight + innerPadding
    };
  }

  if (hasBox) {
    return { x: contentPadding * 2, y: contentPadding * 2 };
  }

  return { x: 0, y: 0 };
}

export function fitFrameRectToAsset({
  bounds,
  asset,
  card,
  cardWidth,
  contentPadding
}: {
  bounds: Rect;
  asset?: MantleAsset | undefined;
  card: MantleCard;
  cardWidth: number;
  contentPadding: number;
}): Rect {
  const assetWidth = asset?.width ?? 16;
  const assetHeight = asset?.height ?? 9;
  const aspect = Math.max(0.05, assetWidth / assetHeight);
  const reserved = getFrameChromeReservedSpace(
    card.frame.preset,
    resolveFrameBoxStyle(card.frame),
    cardWidth,
    contentPadding
  );
  const contentMaxWidth = Math.max(1, bounds.width - reserved.x);
  const contentMaxHeight = Math.max(1, bounds.height - reserved.y);

  let contentWidth = contentMaxWidth;
  let contentHeight = contentWidth / aspect;
  if (contentHeight > contentMaxHeight) {
    contentHeight = contentMaxHeight;
    contentWidth = contentHeight * aspect;
  }

  const frameWidth = contentWidth + reserved.x;
  const frameHeight = contentHeight + reserved.y;

  return {
    x: bounds.x + (bounds.width - frameWidth) / 2,
    y: bounds.y + (bounds.height - frameHeight) / 2,
    width: frameWidth,
    height: frameHeight
  };
}
