import { DEFAULT_MANTLE_TARGETS } from '@mantle/schemas/defaults';
import {
  type MantleRuntimeProject as RuntimeMantleProject,
  type MantleSurfaceAspectRatioPreset,
  type MantleSurfaceTarget
} from '@mantle/schemas/model';

const CUSTOM_TARGET_PREFIX = 'custom-card-';
const MIN_SURFACE_DIMENSION = 320;
export const MAX_SURFACE_DIMENSION = 4096;

export function normalizeSurfaceDimension(value: number, fallback: number): number {
  const next = Number.isFinite(value) ? value : fallback;
  return Math.min(
    MAX_SURFACE_DIMENSION,
    Math.max(MIN_SURFACE_DIMENSION, Math.round(next))
  );
}

export function fitSurfaceSizeToRatio({
  value,
  ratio,
  anchor
}: {
  value: number;
  ratio: number;
  anchor: 'width' | 'height';
}): Pick<MantleSurfaceTarget, 'width' | 'height'> {
  if (anchor === 'width') {
    let width = normalizeSurfaceDimension(value, DEFAULT_MANTLE_TARGETS[0]!.width);
    let height = Math.round(width / ratio);

    if (height > MAX_SURFACE_DIMENSION) {
      height = MAX_SURFACE_DIMENSION;
      width = Math.round(height * ratio);
    }
    if (height < MIN_SURFACE_DIMENSION) {
      height = MIN_SURFACE_DIMENSION;
      width = Math.round(height * ratio);
    }

    return {
      width: normalizeSurfaceDimension(width, DEFAULT_MANTLE_TARGETS[0]!.width),
      height: normalizeSurfaceDimension(height, DEFAULT_MANTLE_TARGETS[0]!.height)
    };
  }

  let height = normalizeSurfaceDimension(value, DEFAULT_MANTLE_TARGETS[0]!.height);
  let width = Math.round(height * ratio);

  if (width > MAX_SURFACE_DIMENSION) {
    width = MAX_SURFACE_DIMENSION;
    height = Math.round(width / ratio);
  }
  if (width < MIN_SURFACE_DIMENSION) {
    width = MIN_SURFACE_DIMENSION;
    height = Math.round(width / ratio);
  }

  return {
    width: normalizeSurfaceDimension(width, DEFAULT_MANTLE_TARGETS[0]!.width),
    height: normalizeSurfaceDimension(height, DEFAULT_MANTLE_TARGETS[0]!.height)
  };
}

export function upsertCustomTargetForActiveCard(
  project: RuntimeMantleProject,
  patch: Partial<Pick<MantleSurfaceTarget, 'width' | 'height'>>,
  aspectRatioPresetId?: MantleSurfaceAspectRatioPreset
): RuntimeMantleProject {
  const card = project.cards.find((item) => item.id === project.activeCardId);
  if (!card) return project;

  const baseTarget =
    project.targets.find((target) => target.id === card.targetId) ??
    project.targets[0] ??
    DEFAULT_MANTLE_TARGETS[0]!;
  const customTargetId = `${CUSTOM_TARGET_PREFIX}${card.id}`;
  const nextAspectRatioPresetId =
    aspectRatioPresetId ?? baseTarget.aspectRatioPresetId ?? 'free';
  const nextTarget: MantleSurfaceTarget = {
    id: customTargetId,
    kind: 'custom',
    label: nextAspectRatioPresetId === 'free' ? 'Freeform' : 'Custom ratio',
    width: normalizeSurfaceDimension(patch.width ?? baseTarget.width, baseTarget.width),
    height: normalizeSurfaceDimension(patch.height ?? baseTarget.height, baseTarget.height),
    platform: 'custom',
    aspectRatioPresetId: nextAspectRatioPresetId
  };
  const hasCustomTarget = project.targets.some((target) => target.id === customTargetId);

  return {
    ...project,
    updatedAt: new Date().toISOString(),
    targets: hasCustomTarget
      ? project.targets.map((target) =>
          target.id === customTargetId ? nextTarget : target
        )
      : [nextTarget, ...project.targets],
    cards: project.cards.map((item) =>
      item.id === card.id ? { ...item, targetId: customTargetId } : item
    )
  };
}
