import type {
  GlyphrameFrameBoxStyle,
  GlyphrameFramePreset,
  GlyphramePalette
} from '@glyphrame/schemas';

import type { Rect } from '../types';

export type { Rect } from '../types';

export type FrameChromePreset = Exclude<
  GlyphrameFramePreset,
  'soft-panel' | 'glass-panel'
>;

export type FrameChromeInput = {
  ctx: CanvasRenderingContext2D;
  /** Outer frame rectangle. Frame chrome and content insets are drawn inside this. */
  imageRect: Rect;
  /** Corner radius of the outer frame rectangle, in draw-space pixels. */
  cornerRadius: number;
  /** Inner spacing between frame chrome and clipped screenshot, in draw-space pixels. */
  contentPadding: number;
  palette: GlyphramePalette;
  /** Draw-space width of the full card (used to scale chrome details). */
  cardWidth: number;
  /** Title text for the chrome bar, derived from frame settings or card name. */
  title?: string;
};

export type FrameChromeResult = {
  /** The clipped image rectangle after chrome reserved its own space. */
  contentRect: Rect;
  /** Radius to apply to the clipped content rectangle. */
  contentRadius: number;
  /**
   * Window-like frames need a straight top edge under the title bar, but
   * rounded lower corners. Defaults to all corners.
   */
  contentCornerStyle?: 'all' | 'bottom' | 'none';
};

export type FrameChrome = (input: FrameChromeInput) => FrameChromeResult;

export type FrameBoxInput = Omit<FrameChromeInput, 'title'> & {
  boxStyle: GlyphrameFrameBoxStyle;
  boxColor?: string | undefined;
  boxBorderColor?: string | undefined;
  boxOpacity?: number | undefined;
};

export type FrameBoxPainter = (input: FrameBoxInput) => void;

export type FrameRegistry = Record<FrameChromePreset, FrameChrome>;
