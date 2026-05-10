export {
  BACKGROUND_PRESET_IDS,
  BACKGROUND_PRESETS,
  getBackgroundPresetDefaultParams,
  isAnimatedBackgroundPresetId,
  isKnownBackgroundPresetId,
  resolveBackgroundPresetDescriptor
} from './composition/backgrounds';
export type {
  BackgroundParamDescriptor,
  BackgroundPresetDescriptor,
  BackgroundPresetId
} from './composition/backgrounds';
export {
  FRAME_BOX_STYLE_IDS,
  FRAME_CHROME_PRESET_IDS,
  resolveFrameBoxStyle
} from './composition/frames';
export type { FrameChromePreset } from './composition/frames';
export { resolveFrameShadowSettings } from './composition/shadows';
export type { ShadowSettings } from './composition/shadows';
