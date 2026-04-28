import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

async function openSection(page: Page, name: string): Promise<void> {
  const section = page.getByRole('button', { name, exact: true });
  if ((await section.getAttribute('aria-expanded')) !== 'true') {
    await section.click();
  }
}

test('loads a saved Mantle project file', async ({ page }, testInfo) => {
  const now = '2026-04-24T00:00:00.000Z';
  const projectPath = testInfo.outputPath('loaded.mantle.json');
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
        themeId: 'terminal-scanline',
        background: {
          family: 'glyph-field',
          presetId: 'terminal-scanline',
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
          boxStyle: 'solid',
          padding: 96,
          contentPadding: 0,
          cornerRadius: 24,
          shadowColor: '#000000',
          shadowStrength: 1,
          shadowSoftness: 1,
          shadowDistance: 1,
          alignment: 'center'
        },
        text: {
          placement: 'top',
          align: 'center',
          titleFont: 'sans',
          subtitleFont: 'sans',
          title: 'Loaded from a Mantle project',
          subtitle: 'The editor restores saved card data.',
          scale: 1,
          width: 0.72,
          gap: 64
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
        platform: 'social',
        aspectRatioPresetId: '1:1'
      }
    ],
    brand: {
      name: 'Mantle',
      palette: {
        background: '#08080a',
        foreground: '#f4f1e8',
        accent: '#9ad7c7',
        muted: '#86827a'
      }
    },
    themes: [
      {
        id: 'terminal-scanline',
        name: 'Terminal Scanline',
        background: {
          family: 'glyph-field',
          presetId: 'terminal-scanline',
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
          boxStyle: 'solid',
          padding: 96,
          contentPadding: 0,
          cornerRadius: 24,
          shadowColor: '#000000',
          shadowStrength: 1,
          shadowSoftness: 1,
          shadowDistance: 1,
          alignment: 'center'
        },
        text: {
          placement: 'top',
          align: 'center',
          titleFont: 'sans',
          subtitleFont: 'sans',
          title: 'Loaded from a Mantle project',
          subtitle: 'The editor restores saved card data.',
          scale: 1,
          width: 0.72,
          gap: 64
        }
      }
    ]
  };

  await writeFile(projectPath, JSON.stringify(project), 'utf8');

  await page.goto('/');
  await page.getByTestId('project-file-input').setInputFiles(projectPath);

  await expect(page.getByText('Saved Card', { exact: true }).first()).toBeVisible();
  await openSection(page, 'Text');
  await openSection(page, 'Canvas size');
  await expect(page.getByRole('button', { name: 'Top', exact: true })).toHaveClass(
    /Active/
  );
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
    'Loaded from a Mantle project'
  );
  await expect(
    page.getByRole('textbox', { name: 'Subtitle', exact: true })
  ).toHaveValue('The editor restores saved card data.');
  await expect(page.getByRole('spinbutton', { name: 'Width' })).toHaveValue('1080');
  await expect(page.getByRole('spinbutton', { name: 'Height' })).toHaveValue('1080');
});

test('shows a visible error for an invalid project file', async ({ page }, testInfo) => {
  const projectPath = testInfo.outputPath('broken.mantle.json');
  await writeFile(projectPath, '{not-json', 'utf8');

  await page.goto('/');
  await page.getByTestId('project-file-input').setInputFiles(projectPath);

  await expect(page.getByText('Project file could not be opened')).toBeVisible();
});
