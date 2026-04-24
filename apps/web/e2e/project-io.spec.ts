import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('loads a saved Glyphrame project file', async ({ page }, testInfo) => {
  const now = '2026-04-24T00:00:00.000Z';
  const projectPath = testInfo.outputPath('loaded.glyphrame.json');
  const project = {
    version: 1,
    id: 'loaded-project',
    name: 'Loaded Project',
    createdAt: now,
    updatedAt: now,
    activeCardId: 'loaded-card',
    assets: [],
    cards: [
      {
        id: 'loaded-card',
        name: 'Saved Card',
        targetId: 'square',
        templateId: 'single-shot-centered',
        themeId: 'terminal-glass',
        background: {
          family: 'glyph-field',
          presetId: 'terminal-glass',
          seed: 'loaded-project',
          intensity: 0.72,
          palette: {
            background: '#08080a',
            foreground: '#f4f1e8',
            accent: '#9ad7c7',
            muted: '#86827a'
          }
        },
        frame: {
          preset: 'minimal-browser',
          padding: 96,
          cornerRadius: 24,
          shadowPresetId: 'soft-float',
          alignment: 'center'
        },
        typography: {
          presetId: 'editorial-sans',
          align: 'center',
          headlineScale: 1,
          subtitleScale: 1,
          maxWidth: 0.72
        },
        copy: {
          eyebrow: 'Project IO',
          headline: 'Loaded from a Glyphrame project',
          subtitle: 'The editor restores saved card data.'
        },
        export: {
          format: 'png',
          scale: 2
        }
      }
    ],
    targets: [
      {
        id: 'square',
        kind: 'square',
        label: 'Square',
        width: 1080,
        height: 1080,
        platform: 'social'
      }
    ],
    brand: {
      name: 'Glyphrame',
      palette: {
        background: '#08080a',
        foreground: '#f4f1e8',
        accent: '#9ad7c7',
        muted: '#86827a'
      }
    },
    themes: [
      {
        id: 'terminal-glass',
        name: 'Terminal Glass',
        background: {
          family: 'glyph-field',
          presetId: 'terminal-glass',
          seed: 'loaded-project',
          intensity: 0.72,
          palette: {
            background: '#08080a',
            foreground: '#f4f1e8',
            accent: '#9ad7c7',
            muted: '#86827a'
          }
        },
        frame: {
          preset: 'minimal-browser',
          padding: 96,
          cornerRadius: 24,
          shadowPresetId: 'soft-float',
          alignment: 'center'
        },
        typography: {
          presetId: 'editorial-sans',
          align: 'center',
          headlineScale: 1,
          subtitleScale: 1,
          maxWidth: 0.72
        }
      }
    ]
  };

  await writeFile(projectPath, JSON.stringify(project), 'utf8');

  await page.goto('/');
  await page.getByTestId('project-file-input').setInputFiles(projectPath);

  await expect(page.getByText('Saved Card', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Top', exact: true })).toHaveClass(
    /Active/
  );
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
    'Loaded from a Glyphrame project'
  );
  await expect(
    page.getByRole('textbox', { name: 'Subtitle', exact: true })
  ).toHaveValue('The editor restores saved card data.');
  await expect(page.getByRole('spinbutton', { name: 'Width' })).toHaveValue('1080');
  await expect(page.getByRole('spinbutton', { name: 'Height' })).toHaveValue('1080');
});
