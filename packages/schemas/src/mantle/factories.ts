import type {
  MantleBackground,
  MantleCard,
  MantleExportSettings,
  MantleFrame,
  MantleFrameTransform,
  MantlePalette,
  MantleProject,
  MantleSourcePlacement,
  MantleSurfaceTarget,
  MantleText,
  MantleTheme
} from './model';
import {
  DEFAULT_MANTLE_BACKGROUND,
  DEFAULT_MANTLE_EXPORT,
  DEFAULT_MANTLE_FRAME,
  DEFAULT_MANTLE_FRAME_TRANSFORM,
  DEFAULT_MANTLE_PALETTE,
  DEFAULT_MANTLE_SOURCE_PLACEMENT,
  DEFAULT_MANTLE_TARGETS,
  DEFAULT_MANTLE_TEXT,
  DEFAULT_MANTLE_THEME
} from './defaults';

function cloneMantlePalette(palette: MantlePalette): MantlePalette {
  return { ...palette };
}

function cloneMantleBackground(background: MantleBackground): MantleBackground {
  return {
    ...background,
    params: background.params ? { ...background.params } : undefined,
    palette: cloneMantlePalette(background.palette),
    colors: background.colors ? [...background.colors] : undefined
  };
}

function cloneMantleFrame(frame: MantleFrame): MantleFrame {
  return { ...frame };
}

function cloneMantleText(text: MantleText): MantleText {
  return {
    ...text,
    transform: text.transform ? { ...text.transform } : undefined
  };
}

function cloneMantleExportSettings(
  settings: MantleExportSettings
): MantleExportSettings {
  return { ...settings };
}

function cloneMantleSourcePlacement(
  placement: MantleSourcePlacement
): MantleSourcePlacement {
  return {
    ...placement,
    crop: placement.crop ? { ...placement.crop } : undefined,
    focus: placement.focus ? { ...placement.focus } : undefined
  };
}

function cloneMantleFrameTransform(
  transform: MantleFrameTransform
): MantleFrameTransform {
  return { ...transform };
}

function cloneMantleTarget(target: MantleSurfaceTarget): MantleSurfaceTarget {
  return {
    ...target,
    safeArea: target.safeArea ? { ...target.safeArea } : undefined
  };
}

function cloneMantleTheme(theme: MantleTheme): MantleTheme {
  return {
    ...theme,
    background: cloneMantleBackground(theme.background),
    frame: cloneMantleFrame(theme.frame),
    text: cloneMantleText(theme.text)
  };
}

export function createDefaultMantleBackground(): MantleBackground {
  return cloneMantleBackground(DEFAULT_MANTLE_BACKGROUND);
}

export function createDefaultMantleFrame(): MantleFrame {
  return cloneMantleFrame(DEFAULT_MANTLE_FRAME);
}

export function createDefaultMantleText(): MantleText {
  return cloneMantleText(DEFAULT_MANTLE_TEXT);
}

export function createDefaultMantleExportSettings(): MantleExportSettings {
  return cloneMantleExportSettings(DEFAULT_MANTLE_EXPORT);
}

export function createDefaultMantleSourcePlacement(): MantleSourcePlacement {
  return cloneMantleSourcePlacement(DEFAULT_MANTLE_SOURCE_PLACEMENT);
}

export function createDefaultMantleFrameTransform(): MantleFrameTransform {
  return cloneMantleFrameTransform(DEFAULT_MANTLE_FRAME_TRANSFORM);
}

export function createDefaultMantleTargets(): MantleSurfaceTarget[] {
  return DEFAULT_MANTLE_TARGETS.map(cloneMantleTarget);
}

export function createDefaultMantleTheme(): MantleTheme {
  return cloneMantleTheme(DEFAULT_MANTLE_THEME);
}

export function createMantleCard({
  id = 'card-1',
  name = 'Untitled card',
  targetId = DEFAULT_MANTLE_TARGETS[0]?.id ?? 'x-post-landscape',
  sourceAssetId
}: {
  id?: string;
  name?: string;
  targetId?: string;
  sourceAssetId?: string;
} = {}): MantleCard {
  return {
    id,
    name,
    targetId,
    ...(sourceAssetId ? { sourceAssetId } : {}),
    templateId: 'single-shot-centered',
    themeId: DEFAULT_MANTLE_THEME.id,
    background: createDefaultMantleBackground(),
    sourcePlacement: createDefaultMantleSourcePlacement(),
    frameTransform: createDefaultMantleFrameTransform(),
    frame: createDefaultMantleFrame(),
    text: createDefaultMantleText(),
    export: createDefaultMantleExportSettings()
  };
}

export function createMantleProject({
  id = 'mantle-project',
  name = 'Mantle Project',
  brandName = 'Untitled'
}: {
  id?: string;
  name?: string;
  brandName?: string;
} = {}): MantleProject {
  const now = new Date().toISOString();
  const card = createMantleCard();

  return {
    version: 1,
    id,
    name,
    createdAt: now,
    updatedAt: now,
    activeCardId: card.id,
    assets: [],
    cards: [card],
    targets: createDefaultMantleTargets(),
    brand: {
      name: brandName,
      palette: cloneMantlePalette(DEFAULT_MANTLE_PALETTE)
    },
    themes: [createDefaultMantleTheme()]
  };
}
