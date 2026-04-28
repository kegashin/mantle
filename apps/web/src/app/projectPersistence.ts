import type {
  MantleAsset,
  MantleProject,
  MantleRuntimeAsset as RuntimeMantleAsset,
  MantleRuntimeProject as RuntimeMantleProject
} from '@mantle/schemas/model';
import {
  MantleProjectSchema
} from '@mantle/schemas/validation';

export function safeFileName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'mantle-project'
  );
}

function stripAssetBinary(asset: RuntimeMantleAsset): MantleAsset {
  const { objectUrl: _objectUrl, ...metadata } = asset;
  return metadata;
}

export function serializeProjectForSave(
  project: RuntimeMantleProject
): MantleProject {
  return MantleProjectSchema.parse({
    ...project,
    assets: project.assets.map(stripAssetBinary)
  });
}

export async function parseProjectFile(file: File): Promise<MantleProject> {
  const rawProject: unknown = JSON.parse(await file.text());
  return MantleProjectSchema.parse(rawProject);
}
