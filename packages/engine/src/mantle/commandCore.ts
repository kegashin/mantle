import {
  type ExportResult,
  type MantleAsset,
  type MantleCard,
  type MantleProject,
  type MantleRenderableAsset,
  type MantleRuntimeProject,
  type MantleSurfaceTarget
} from '@mantle/schemas/model';
import { MantleProjectSchema } from '@mantle/schemas/validation';

import {
  exportMantleCard,
  renderMantleCardToCanvas,
  type MantleCanvas,
  type MantleRenderInput
} from '../composition/renderMantleCard';

export type { MantleRuntimeProject } from '@mantle/schemas/model';

export type MantleCommandProject = MantleRuntimeProject;

export type MantleCardSelection = {
  cardId?: string | undefined;
};

export type MantleResolvedCard = {
  project: MantleCommandProject;
  card: MantleCard;
  target: MantleSurfaceTarget;
  asset?: MantleRenderableAsset | undefined;
  backgroundAsset?: MantleRenderableAsset | undefined;
};

export type MantleRenderCardCommand = MantleCardSelection & {
  project: MantleCommandProject;
  scale?: number | undefined;
  canvas?: MantleCanvas | undefined;
  renderMode?: MantleRenderInput['renderMode'];
  showEmptyPlaceholderText?: boolean | undefined;
};

export type MantleExportCardCommand = MantleCardSelection & {
  project: MantleCommandProject;
  scale?: number | undefined;
};

export interface MantleCommandCore {
  validateProject(project: MantleCommandProject): MantleCommandProject;
  resolveCard(selection?: MantleCardSelection): MantleResolvedCard;
  renderCard(command?: Omit<MantleRenderCardCommand, 'project'>): Promise<MantleCanvas>;
  exportCard(command?: Omit<MantleExportCardCommand, 'project'>): Promise<ExportResult>;
}

export function validateMantleProject(project: unknown): MantleProject {
  return MantleProjectSchema.parse(project);
}

function stripRenderableAssetForValidation(
  asset: MantleRenderableAsset
): MantleAsset {
  const { objectUrl: _objectUrl, ...persistedAsset } = asset;
  return persistedAsset;
}

export function validateMantleCommandProject(
  project: MantleCommandProject
): MantleCommandProject {
  MantleProjectSchema.parse({
    ...project,
    assets: project.assets.map(stripRenderableAssetForValidation)
  });
  return project;
}

export function resolveMantleProjectCard({
  project,
  cardId
}: {
  project: MantleCommandProject;
  cardId?: string | undefined;
}): MantleResolvedCard {
  validateMantleCommandProject(project);

  const resolvedCardId = cardId ?? project.activeCardId;
  const card = project.cards.find((item) => item.id === resolvedCardId);

  if (!card) {
    throw new Error(`Card "${resolvedCardId}" does not exist in this Mantle project.`);
  }

  const target = project.targets.find((item) => item.id === card.targetId);
  if (!target) {
    throw new Error(`Target "${card.targetId}" does not exist in this Mantle project.`);
  }

  const asset = card.sourceAssetId
    ? project.assets.find((item) => item.id === card.sourceAssetId)
    : undefined;
  const backgroundAsset = card.background.imageAssetId
    ? project.assets.find((item) => item.id === card.background.imageAssetId)
    : undefined;

  if (card.sourceAssetId && !asset) {
    throw new Error(`Asset "${card.sourceAssetId}" does not exist in this Mantle project.`);
  }
  if (card.background.imageAssetId && !backgroundAsset) {
    throw new Error(
      `Background asset "${card.background.imageAssetId}" does not exist in this Mantle project.`
    );
  }

  return {
    project,
    card,
    target,
    asset,
    backgroundAsset
  };
}

export async function renderMantleProjectCard({
  project,
  cardId,
  scale,
  canvas,
  renderMode,
  showEmptyPlaceholderText
}: MantleRenderCardCommand): Promise<MantleCanvas> {
  const resolved = resolveMantleProjectCard({ project, cardId });

  return renderMantleCardToCanvas({
    card: resolved.card,
    target: resolved.target,
    asset: resolved.asset,
    backgroundAsset: resolved.backgroundAsset,
    scale,
    canvas,
    renderMode,
    showEmptyPlaceholderText
  });
}

export async function exportMantleProjectCard({
  project,
  cardId,
  scale
}: MantleExportCardCommand): Promise<ExportResult> {
  const resolved = resolveMantleProjectCard({ project, cardId });

  return exportMantleCard({
    card: resolved.card,
    target: resolved.target,
    asset: resolved.asset,
    backgroundAsset: resolved.backgroundAsset,
    scale
  });
}

export function createMantleCommandCore(
  project: MantleCommandProject
): MantleCommandCore {
  validateMantleCommandProject(project);

  return {
    validateProject: validateMantleCommandProject,
    resolveCard(selection = {}) {
      return resolveMantleProjectCard({
        project,
        cardId: selection.cardId
      });
    },
    renderCard(command = {}) {
      return renderMantleProjectCard({
        project,
        ...command
      });
    },
    exportCard(command = {}) {
      return exportMantleProjectCard({
        project,
        ...command
      });
    }
  };
}
