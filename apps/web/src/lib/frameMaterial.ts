import type { MantleFrame, MantleFrameBoxStyle } from '@mantle/schemas/model';

type GlassFrameMaterial = {
  boxColor: string;
  boxOpacity: number;
  glassBlur: number;
  glassOutlineOpacity: number;
};

export const CSS_GLASS_FRAME_DEFAULTS = {
  boxColor: '#ffffff',
  boxOpacity: 0.2,
  glassBlur: 5,
  glassOutlineOpacity: 0.3
} as const satisfies GlassFrameMaterial;

export function resolveGlassFrameMaterial(
  frame: MantleFrame
): GlassFrameMaterial {
  const preserveExisting = frame.boxStyle === 'glass-panel';

  return {
    boxColor: preserveExisting
      ? frame.boxColor ?? CSS_GLASS_FRAME_DEFAULTS.boxColor
      : CSS_GLASS_FRAME_DEFAULTS.boxColor,
    boxOpacity: preserveExisting
      ? frame.boxOpacity ?? CSS_GLASS_FRAME_DEFAULTS.boxOpacity
      : CSS_GLASS_FRAME_DEFAULTS.boxOpacity,
    glassBlur: preserveExisting
      ? frame.glassBlur ?? CSS_GLASS_FRAME_DEFAULTS.glassBlur
      : CSS_GLASS_FRAME_DEFAULTS.glassBlur,
    glassOutlineOpacity: preserveExisting
      ? frame.glassOutlineOpacity ?? CSS_GLASS_FRAME_DEFAULTS.glassOutlineOpacity
      : CSS_GLASS_FRAME_DEFAULTS.glassOutlineOpacity
  };
}

export function resolveFrameContentPaddingForBoxStyle(
  boxStyle: MantleFrameBoxStyle,
  current: number | undefined
): number {
  if (current && current > 0) return current;
  return boxStyle === 'glass-panel' ? 32 : 0;
}
