import type {
  AnimationSettings,
  ConversionSettings,
  PreviewState,
  SourceDescriptor
} from '@glyphrame/schemas';

export type PreviewSourceImage = ImageBitmap | HTMLImageElement;

export type EngineSessionState = {
  source: SourceDescriptor | null;
  sourceBitmap: PreviewSourceImage | null;
  disposeSource: (() => void) | null;
  conversionSettings: ConversionSettings;
  animationSettings: AnimationSettings;
  previewState: PreviewState;
  asciiTextLines: string[];
};
