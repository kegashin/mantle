import type {
  MantleBackgroundParams,
  MantlePalette
} from '@mantle/schemas/model';

import type { MantleCanvasRenderingContext2D } from '../canvas';
import type { MantleRenderMode, Rect } from '../types';

export type BackgroundGeneratorInput = {
  ctx: MantleCanvasRenderingContext2D;
  rect: Rect;
  palette: MantlePalette;
  colors?: string[] | undefined;
  intensity: number;
  params: MantleBackgroundParams;
  seed: string;
  renderMode: MantleRenderMode;
  timeMs: number;
  /** Draw-space scale factor relative to the nominal 1600-wide target. */
  scale: number;
};

export type BackgroundGenerator = (input: BackgroundGeneratorInput) => void | Promise<void>;
