import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MANTLE_TARGETS,
  MantleCardSchema,
  MantleProjectSchema,
  createMantleCard,
  createMantleProject,
  type MantleAsset
} from './index';

describe('MantleProjectSchema', () => {
  it('accepts the default project factory output', () => {
    const project = createMantleProject({
      id: 'demo-project',
      name: 'Demo Mantle',
      brandName: 'Glyph Co'
    });

    expect(MantleProjectSchema.parse(project)).toEqual(project);
    expect(project.cards).toHaveLength(1);
    expect(project.activeCardId).toBe(project.cards[0]?.id);
  });

  it('accepts a custom export filename', () => {
    const card = createMantleCard();
    card.export = {
      ...card.export,
      fileName: 'launch-update'
    };

    expect(MantleCardSchema.parse(card).export.fileName).toBe('launch-update');
  });

  it('accepts focus and zoom source placement for responsive frame resizing', () => {
    const card = createMantleCard();
    card.sourcePlacement = {
      mode: 'crop',
      focus: { x: 0.42, y: 0.58 },
      zoom: 1.8
    };

    expect(MantleCardSchema.parse(card).sourcePlacement).toEqual({
      mode: 'crop',
      focus: { x: 0.42, y: 0.58 },
      zoom: 1.8
    });
  });

  it('accepts a social card with an imported screenshot asset', () => {
    const project = createMantleProject();
    const asset = {
      id: 'asset-home-screen',
      role: 'screenshot',
      name: 'Home screen',
      mimeType: 'image/png',
      width: 1440,
      height: 1000,
      fileSize: 820_000,
      sourcePath: 'assets/home.png'
    } satisfies MantleAsset;
    const card = createMantleCard({
      id: 'card-launch',
      name: 'Demo card',
      targetId: 'linkedin-feed',
      sourceAssetId: asset.id
    });
    const { colors: _defaultColors, ...backgroundBase } = card.background;

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
      ...backgroundBase,
      family: 'mesh',
      presetId: 'contour-lines',
      seed: 'launch-card',
      params: {
        lineDensity: 0.62,
        relief: 0.56,
        accentGlow: 0.48
      }
    };

    const parsed = MantleProjectSchema.parse({
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
        family: 'mesh',
        presetId: 'contour-lines'
      },
      text: {
        placement: 'top',
        title: 'A cleaner way to frame product updates'
      }
    });
  });

  it('rejects embedded asset data urls', () => {
    const project = createMantleProject();

    expect(() =>
      MantleProjectSchema.parse({
        ...project,
        assets: [
          {
            id: 'asset-embedded',
            role: 'screenshot',
            name: 'Embedded screenshot',
            mimeType: 'image/png',
            dataUrl: 'data:image/png;base64,abc'
          }
        ]
      })
    ).toThrow(/Unrecognized key/);
  });

  it('keeps the first target aligned with the single-card default', () => {
    const card = createMantleCard();

    expect(card.targetId).toBe(DEFAULT_MANTLE_TARGETS[0]?.id);
    expect(
      DEFAULT_MANTLE_TARGETS.some((target) => target.id === card.targetId)
    ).toBe(true);
  });

  it('creates isolated mutable defaults for each card and project', () => {
    const firstCard = createMantleCard();
    const secondCard = createMantleCard();

    firstCard.background.params!.complexity = 0.11;
    firstCard.background.palette.background = '#ffffff';
    firstCard.frame.padding = 12;

    expect(secondCard.background.params?.complexity).toBe(1);
    expect(secondCard.background.colors).toEqual([
      '#050505',
      '#f5f5f5',
      '#252525',
      '#d8d8d8',
      '#737373',
      '#ffffff'
    ]);
    expect(secondCard.background.palette.background).toBe('#050505');
    expect(secondCard.frame.padding).toBe(96);

    const firstProject = createMantleProject();
    const secondProject = createMantleProject();
    firstProject.targets[0]!.width = 1234;
    firstProject.brand.palette.background = '#ffffff';

    expect(secondProject.targets[0]?.width).toBe(DEFAULT_MANTLE_TARGETS[0]?.width);
    expect(secondProject.brand.palette.background).toBe('#050505');
  });

  it('rejects missing text objects and font ids instead of schema defaults', () => {
    const card = createMantleCard();
    const { text: _cardText, ...cardWithoutText } = card;
    const project = createMantleProject();
    const theme = project.themes[0]!;
    const { text: _themeText, ...themeWithoutText } = theme;
    const { titleFont: _titleFont, ...textWithoutTitleFont } = card.text;

    expect(() => MantleCardSchema.parse(cardWithoutText)).toThrow(/text/);
    expect(() =>
      MantleProjectSchema.parse({
        ...project,
        themes: [themeWithoutText]
      })
    ).toThrow(/text/);
    expect(() =>
      MantleCardSchema.parse({
        ...card,
        text: textWithoutTitleFont
      })
    ).toThrow(/titleFont/);
  });

  it('rejects unknown persisted project fields', () => {
    const project = createMantleProject();
    const card = createMantleCard();

    expect(() =>
      MantleCardSchema.parse({
        ...card,
        staleRendererField: true
      })
    ).toThrow(/Unrecognized key/);

    expect(() =>
      MantleProjectSchema.parse({
        ...project,
        assets: [
          {
            id: 'asset-runtime',
            role: 'screenshot',
            name: 'runtime.png',
            objectUrl: 'blob:mantle-runtime'
          }
        ]
      })
    ).toThrow(/Unrecognized key/);

    expect(() =>
      MantleProjectSchema.parse({
        ...project,
        brand: {
          ...project.brand,
          staleBrandField: true
        }
      })
    ).toThrow(/Unrecognized key/);
  });

  it('rejects invalid background intensity values', () => {
    const card = createMantleCard();

    expect(() =>
      MantleCardSchema.parse({
        ...card,
        background: {
          ...card.background,
          intensity: 1.5
        }
      })
    ).toThrow();
  });

  it('rejects invalid background parameter values', () => {
    const card = createMantleCard();

    expect(() =>
      MantleCardSchema.parse({
        ...card,
        background: {
          ...card.background,
          params: {
            curve: 4.2
          }
        }
      })
    ).toThrow();
  });

  it('accepts image backgrounds when they point to an asset', () => {
    const backgroundAsset = {
      id: 'asset-background',
      role: 'background',
      name: 'background.png',
      mimeType: 'image/png',
      width: 1600,
      height: 900
    } as const;
    const project = createMantleProject();
    const card = project.cards[0]!;
    const { colors: _defaultColors, ...backgroundBase } = card.background;

    const parsed = MantleProjectSchema.parse({
      ...project,
      assets: [backgroundAsset],
      cards: [
        {
          ...card,
          background: {
            ...backgroundBase,
            family: 'image',
            presetId: 'image-fill',
            seed: 'background-image',
            intensity: 1,
            params: {},
            imageAssetId: backgroundAsset.id
          }
        }
      ]
    });

    expect(parsed.cards[0]?.background.imageAssetId).toBe(backgroundAsset.id);
  });

  it('rejects unsupported background presets and invalid image-background fields', () => {
    const card = createMantleCard();
    const { colors: _defaultColors, ...backgroundBase } = card.background;

    expect(() =>
      MantleCardSchema.parse({
        ...card,
        background: {
          ...card.background,
          presetId: 'missing-preset'
        }
      })
    ).toThrow();

    expect(() =>
      MantleCardSchema.parse({
        ...card,
        background: {
          ...backgroundBase,
          family: 'image',
          presetId: 'solid-color'
        }
      })
    ).toThrow();

    expect(() =>
      MantleCardSchema.parse({
        ...card,
        background: {
          ...card.background,
          imageAssetId: 'asset-background'
        }
      })
    ).toThrow();

    expect(() =>
      MantleCardSchema.parse({
        ...card,
        background: {
          ...backgroundBase,
          family: 'image',
          presetId: 'image-fill',
          seed: 'missing-image',
          intensity: 1,
          params: {}
        }
      })
    ).toThrow(/imageAssetId/);
  });

  it('rejects background family and parameter mismatches', () => {
    const card = createMantleCard();

    expect(() =>
      MantleCardSchema.parse({
        ...card,
        background: {
          ...card.background,
          family: 'solid',
          presetId: 'terminal-scanline'
        }
      })
    ).toThrow(/does not match preset/);

    expect(() =>
      MantleCardSchema.parse({
        ...card,
        background: {
          ...card.background,
          presetId: 'terminal-scanline',
          params: {
            angle: 0.5
          }
        }
      })
    ).toThrow(/not supported/);
  });

  it('accepts extended dot grid opacity values', () => {
    const card = createMantleCard();
    const { colors: _defaultColors, ...backgroundBase } = card.background;

    const parsed = MantleCardSchema.parse({
      ...card,
      background: {
        ...backgroundBase,
        family: 'solid',
        presetId: 'dot-grid',
        params: {
          dotOpacity: 2,
          dotSize: 0.5,
          dotDensity: 0.5
        }
      }
    });

    expect(parsed.background.params?.dotOpacity).toBe(2);
  });

  it('accepts bounded multi-color gradient backgrounds', () => {
    const card = createMantleCard();

    const parsed = MantleCardSchema.parse({
      ...card,
      background: {
        ...card.background,
        family: 'gradient',
        presetId: 'soft-gradient',
        params: {
          angle: 0.58,
          spread: 0.58,
          glow: 0.46,
          grain: 0.08
        },
        colors: ['#10151c', '#f1aa6b', '#6cc3b4', '#8f7af0', '#f4d35e', '#ff6b8a']
      }
    });

    expect(parsed.background.colors).toHaveLength(6);
  });

  it('rejects non-hex color values instead of deferring to renderer fallbacks', () => {
    const card = createMantleCard();

    expect(() =>
      MantleCardSchema.parse({
        ...card,
        background: {
          ...card.background,
          palette: {
            ...card.background.palette,
            accent: 'not-a-color'
          }
        }
      })
    ).toThrow(/hex color/);

    expect(() =>
      MantleCardSchema.parse({
        ...card,
        frame: {
          ...card.frame,
          shadowColor: 'black'
        }
      })
    ).toThrow(/hex color/);

    expect(() =>
      MantleCardSchema.parse({
        ...card,
        text: {
          ...card.text,
          titleColor: '#12'
        }
      })
    ).toThrow(/hex color/);
  });

  it('accepts extended aurora gradient controls', () => {
    const card = createMantleCard();

    const parsed = MantleCardSchema.parse({
      ...card,
      background: {
        ...card.background,
        family: 'gradient',
        presetId: 'aurora-gradient',
        params: {
          glow: 4,
          spread: 3,
          grain: 1
        }
      }
    });

    expect(parsed.background.params?.glow).toBe(4);
    expect(parsed.background.params?.spread).toBe(3);
  });

  it('accepts extended marbling controls', () => {
    const card = createMantleCard();

    const parsed = MantleCardSchema.parse({
      ...card,
      background: {
        ...card.background,
        family: 'gradient',
        presetId: 'marbling',
        params: {
          complexity: 2,
          sharpness: 2,
          curve: 4,
          grain: 2
        },
        colors: ['#050505', '#f5f5f5']
      }
    });

    expect(parsed.background.params?.complexity).toBe(2);
    expect(parsed.background.params?.sharpness).toBe(2);
    expect(parsed.background.params?.curve).toBe(4);
    expect(parsed.background.params?.grain).toBe(2);
  });

  it('accepts css.glass-style frame settings', () => {
    const card = createMantleCard();

    const parsed = MantleCardSchema.parse({
      ...card,
      frame: {
        ...card.frame,
        boxStyle: 'glass-panel',
        boxColor: '#151515',
        boxOpacity: 0.35,
        glassBlur: 5,
        glassOutlineOpacity: 0.47
      }
    });

    expect(parsed.frame).toMatchObject({
      boxStyle: 'glass-panel',
      boxColor: '#151515',
      boxOpacity: 0.35,
      glassBlur: 5,
      glassOutlineOpacity: 0.47
    });
  });

  it('accepts extended frame shadow controls', () => {
    const card = createMantleCard();

    const parsed = MantleCardSchema.parse({
      ...card,
      frame: {
        ...card.frame,
        shadowStrength: 4,
        shadowSoftness: 4,
        shadowDistance: 4
      }
    });

    expect(parsed.frame.shadowStrength).toBe(4);
    expect(parsed.frame.shadowSoftness).toBe(4);
    expect(parsed.frame.shadowDistance).toBe(4);
  });

  it('rejects gradient color lists outside the supported bounds', () => {
    const card = createMantleCard();

    expect(() =>
      MantleCardSchema.parse({
        ...card,
        background: {
          ...card.background,
          colors: ['#10151c']
        }
      })
    ).toThrow();

    expect(() =>
      MantleCardSchema.parse({
        ...card,
        background: {
          ...card.background,
          colors: [
            '#10151c',
            '#f1aa6b',
            '#6cc3b4',
            '#8f7af0',
            '#f4d35e',
            '#ff6b8a',
            '#ffffff'
          ]
        }
      })
    ).toThrow();
  });

  it('rejects projects with a missing active card reference', () => {
    const project = createMantleProject();

    expect(() =>
      MantleProjectSchema.parse({
        ...project,
        activeCardId: 'missing-card'
      })
    ).toThrow(/activeCardId/);
  });

  it('rejects projects with broken card references', () => {
    const project = createMantleProject();
    const { colors: _defaultColors, ...backgroundBase } = project.cards[0]!.background;
    const card = createMantleCard({
      id: 'broken-card',
      targetId: 'missing-target',
      sourceAssetId: 'missing-asset'
    });

    expect(() =>
      MantleProjectSchema.parse({
        ...project,
        activeCardId: card.id,
        cards: [
          {
            ...card,
            themeId: 'missing-theme',
            background: {
              ...backgroundBase,
              family: 'image',
              presetId: 'image-fill',
              seed: 'missing-background',
              intensity: 1,
              params: {},
              imageAssetId: 'missing-background-asset'
            }
          }
        ]
      })
    ).toThrow(/targetId|themeId|sourceAssetId|imageAssetId/);
  });

  it('rejects duplicate project entity ids', () => {
    const project = createMantleProject();

    expect(() =>
      MantleProjectSchema.parse({
        ...project,
        cards: [project.cards[0], project.cards[0]]
      })
    ).toThrow(/Duplicate cards id/);
  });
});
