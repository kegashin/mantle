import { createMantleCard } from '@mantle/schemas/defaults';
import type { MantleSurfaceTarget } from '@mantle/schemas/model';
import { describe, expect, it } from 'vitest';

import {
  resolveMantleExportFileName,
  resolveMantleRenderSize,
  validateMantleRenderBudget
} from './renderMantleCard';

const target = {
  id: 'large',
  kind: 'custom',
  label: 'Large',
  width: 4096,
  height: 4096,
  platform: 'custom'
} satisfies MantleSurfaceTarget;

describe('resolveMantleRenderSize', () => {
  it('allows high-res exports inside the canvas safety envelope', () => {
    expect(resolveMantleRenderSize(target, 2)).toEqual({
      scale: 2,
      width: 8192,
      height: 8192
    });
  });

  it('rejects exports that exceed the canvas safety envelope', () => {
    expect(() => resolveMantleRenderSize(target, 5)).toThrow(
      /too large/
    );
  });

  it('rejects high-res glass exports that exceed the effect memory budget', () => {
    const card = createMantleCard();
    card.frame = {
      ...card.frame,
      boxStyle: 'glass-panel',
      glassBlur: 5
    };

    expect(() => validateMantleRenderBudget(card, 8192, 8192)).toThrow(
      /working canvas memory/
    );
  });

  it('uses the source image name as the default export filename', () => {
    const card = createMantleCard({
      name: 'Untitled card',
      sourceAssetId: 'asset-source'
    });
    const asset = {
      id: 'asset-source',
      role: 'screenshot',
      name: 'Screenshot 2026-04-29 at 09.58.08.png',
      width: 1200,
      height: 800,
      objectUrl: 'blob:mantle-source'
    } as const;

    expect(resolveMantleExportFileName(card, asset)).toBe(
      'screenshot-2026-04-29-at-09-58-08.png'
    );
  });

  it('lets explicit export filenames override source names', () => {
    const card = createMantleCard({
      sourceAssetId: 'asset-source'
    });
    card.export = {
      ...card.export,
      format: 'jpeg',
      fileName: 'Launch update.png'
    };
    const asset = {
      id: 'asset-source',
      role: 'screenshot',
      name: 'source.png',
      width: 1200,
      height: 800,
      objectUrl: 'blob:mantle-source'
    } as const;

    expect(resolveMantleExportFileName(card, asset)).toBe('launch-update.jpg');
  });

  it('resolves gif export filenames', () => {
    const card = createMantleCard({
      sourceAssetId: 'asset-source'
    });
    card.export = {
      ...card.export,
      format: 'gif'
    };
    const asset = {
      id: 'asset-source',
      role: 'screenshot',
      name: 'source.webp',
      width: 1200,
      height: 800,
      objectUrl: 'blob:mantle-source'
    } as const;

    expect(resolveMantleExportFileName(card, asset)).toBe('source.gif');
  });

  it('resolves mp4 export filenames', () => {
    const card = createMantleCard({
      sourceAssetId: 'asset-source'
    });
    card.export = {
      ...card.export,
      format: 'mp4'
    };
    const asset = {
      id: 'asset-source',
      role: 'screenshot',
      name: 'source.webm',
      width: 1200,
      height: 800,
      objectUrl: 'blob:mantle-source'
    } as const;

    expect(resolveMantleExportFileName(card, asset)).toBe('source.mp4');
  });
});
