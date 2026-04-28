import { describe, expect, it } from 'vitest';

import {
  createMantleCard,
  createMantleProject
} from '@mantle/schemas/defaults';

import {
  createMantleCommandCore,
  resolveMantleProjectCard,
  validateMantleCommandProject,
  validateMantleProject,
  type MantleCommandProject
} from './commandCore';

describe('Mantle command core', () => {
  it('validates and resolves the active card, target and asset', () => {
    const project = createMantleProject();
    const asset = {
      id: 'asset-1',
      role: 'screenshot',
      name: 'screenshot.png',
      width: 1200,
      height: 800,
      objectUrl: 'blob:mantle-test'
    } satisfies MantleCommandProject['assets'][number];
    const card = createMantleCard({
      id: 'card-asset',
      sourceAssetId: asset.id
    });
    const commandProject = {
      ...project,
      activeCardId: card.id,
      assets: [asset],
      cards: [card]
    } satisfies MantleCommandProject;

    const resolved = resolveMantleProjectCard({ project: commandProject });

    expect(validateMantleCommandProject(commandProject).activeCardId).toBe(card.id);
    expect(resolved.card.id).toBe(card.id);
    expect(resolved.target.id).toBe(card.targetId);
    expect(resolved.asset?.objectUrl).toBe(asset.objectUrl);
  });

  it('keeps persisted validation strict while command validation accepts runtime object URLs', () => {
    const project = createMantleProject();
    const commandProject = {
      ...project,
      assets: [
        {
          id: 'asset-runtime-url',
          role: 'screenshot',
          name: 'runtime.png',
          width: 1200,
          height: 800,
          objectUrl: 'blob:mantle-runtime'
        }
      ]
    } satisfies MantleCommandProject;

    expect(() => validateMantleProject(commandProject)).toThrow(/Unrecognized key/);
    expect(validateMantleCommandProject(commandProject).assets[0]?.objectUrl).toBe(
      'blob:mantle-runtime'
    );
  });

  it('command core validates the runtime command project shape', () => {
    const project = createMantleProject();
    const commandProject = {
      ...project,
      assets: [
        {
          id: 'asset-core-runtime-url',
          role: 'screenshot',
          name: 'runtime.png',
          width: 1200,
          height: 800,
          objectUrl: 'blob:mantle-core-runtime'
        }
      ]
    } satisfies MantleCommandProject;
    const commandCore = createMantleCommandCore(commandProject);

    expect(commandCore.validateProject(commandProject).assets[0]?.objectUrl).toBe(
      'blob:mantle-core-runtime'
    );
  });

  it('rejects broken projects before commands run', () => {
    const project = createMantleProject();
    const commandCore = () =>
      createMantleCommandCore({
        ...project,
        activeCardId: 'missing-card'
      });

    expect(commandCore).toThrow(/activeCardId/);
  });
});
