import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GLYPHRAME_TARGETS,
  GlyphrameCardSchema,
  GlyphrameProjectSchema,
  createGlyphrameCard,
  createGlyphrameProject
} from './project';

describe('GlyphrameProjectSchema', () => {
  it('accepts the default project factory output', () => {
    const project = createGlyphrameProject({
      id: 'demo-project',
      name: 'Demo Glyphrame',
      brandName: 'Glyph Co'
    });

    expect(GlyphrameProjectSchema.parse(project)).toEqual(project);
    expect(project.cards).toHaveLength(1);
    expect(project.activeCardId).toBe(project.cards[0]?.id);
  });

  it('accepts a social card with an imported screenshot asset', () => {
    const project = createGlyphrameProject();
    const asset = {
      id: 'asset-home-screen',
      role: 'screenshot' as const,
      name: 'Home screen',
      mimeType: 'image/png',
      width: 1440,
      height: 1000,
      fileSize: 820_000,
      sourcePath: 'assets/home.png'
    };
    const card = createGlyphrameCard({
      id: 'card-launch',
      name: 'Launch card',
      targetId: 'linkedin-feed',
      sourceAssetId: asset.id
    });

    card.text = {
      placement: 'top',
      align: 'center',
      titleFont: 'sans',
      subtitleFont: 'sans',
      title: 'A cleaner way to frame product updates',
      subtitle: 'Glyph-backed screenshots for social posts and docs.',
      scale: 1,
      width: 0.72,
      gap: 64
    };
    card.background = {
      ...card.background,
      family: 'ascii-texture',
      presetId: 'quiet-graphite',
      seed: 'launch-card'
    };

    const parsed = GlyphrameProjectSchema.parse({
      ...project,
      activeCardId: card.id,
      assets: [asset],
      cards: [card]
    });

    expect(parsed.cards[0]).toMatchObject({
      id: 'card-launch',
      targetId: 'linkedin-feed',
      sourceAssetId: asset.id,
      background: {
        family: 'ascii-texture',
        presetId: 'quiet-graphite'
      },
      text: {
        placement: 'top',
        title: 'A cleaner way to frame product updates'
      }
    });
  });

  it('keeps the first target aligned with the single-card default', () => {
    const card = createGlyphrameCard();

    expect(card.targetId).toBe(DEFAULT_GLYPHRAME_TARGETS[0]?.id);
    expect(
      DEFAULT_GLYPHRAME_TARGETS.some((target) => target.id === card.targetId)
    ).toBe(true);
  });

  it('rejects invalid background intensity values', () => {
    const card = createGlyphrameCard();

    expect(() =>
      GlyphrameCardSchema.parse({
        ...card,
        background: {
          ...card.background,
          intensity: 1.5
        }
      })
    ).toThrow();
  });

  it('rejects invalid background parameter values', () => {
    const card = createGlyphrameCard();

    expect(() =>
      GlyphrameCardSchema.parse({
        ...card,
        background: {
          ...card.background,
          params: {
            scanlineDensity: 1.2
          }
        }
      })
    ).toThrow();
  });
});
