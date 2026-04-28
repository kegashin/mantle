import { expect, test, type Page } from '@playwright/test';
import { MantleProjectSchema } from '@mantle/schemas/validation';
import { readFile, writeFile } from 'node:fs/promises';

const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8U8AAAAASUVORK5CYII=';

async function openSection(page: Page, name: string): Promise<void> {
  const section = page.getByRole('button', { name, exact: true });
  if ((await section.getAttribute('aria-expanded')) !== 'true') {
    await section.click();
  }
}

test('loads a local image into the active Mantle card', async ({ page }, testInfo) => {
  const sourcePath = testInfo.outputPath('sample.png');
  await writeFile(sourcePath, Buffer.from(SAMPLE_PNG_BASE64, 'base64'));

  await page.goto('/');
  await page.getByTestId('source-file-input').setInputFiles(sourcePath);

  await expect(page.getByText('sample.png', { exact: true })).toBeVisible();
  await expect(page.getByText('sample', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/1 × 1/).first()).toBeVisible();
});

test('saves project metadata without embedded image data', async ({ page }, testInfo) => {
  const sourcePath = testInfo.outputPath('sample-save.png');
  await writeFile(sourcePath, Buffer.from(SAMPLE_PNG_BASE64, 'base64'));

  await page.goto('/');
  await page.getByTestId('source-file-input').setInputFiles(sourcePath);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();

  const rawProject = await readFile(downloadPath!, 'utf8');
  const rawSavedProject: unknown = JSON.parse(rawProject);
  const savedProject = MantleProjectSchema.parse(rawSavedProject);

  expect(savedProject.assets[0]).toMatchObject({
    name: 'sample-save.png',
    width: 1,
    height: 1
  });
  expect(savedProject.assets[0]).not.toHaveProperty('dataUrl');
  expect(JSON.stringify(savedProject)).not.toContain('data:image');
});

test('asks to reimport source image after loading a metadata-only project', async ({ page }, testInfo) => {
  const sourcePath = testInfo.outputPath('sample-reimport.png');
  await writeFile(sourcePath, Buffer.from(SAMPLE_PNG_BASE64, 'base64'));

  await page.goto('/');
  await page.getByTestId('source-file-input').setInputFiles(sourcePath);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();

  await page.getByTestId('project-file-input').setInputFiles(downloadPath!);

  await expect(page.getByText('Reimport source image')).toBeVisible();
  await expect(page.getByText('Source image missing')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Relink image' }).first()).toBeVisible();

  await page.getByTestId('source-file-input').setInputFiles(sourcePath);

  await expect(page.getByText('Image relinked')).toBeVisible();
  await expect(page.getByText('Source image missing')).toHaveCount(0);
});

test('saves applied style presets as project themes', async ({ page }, testInfo) => {
  const sourcePath = testInfo.outputPath('sample-preset-save.png');
  await writeFile(sourcePath, Buffer.from(SAMPLE_PNG_BASE64, 'base64'));

  await page.goto('/');
  await page.getByTestId('source-file-input').setInputFiles(sourcePath);
  await page.getByRole('button', { name: /Contour Lines/i }).first().click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();

  const rawProject = await readFile(downloadPath!, 'utf8');
  const rawSavedProject: unknown = JSON.parse(rawProject);
  const savedProject = MantleProjectSchema.parse(rawSavedProject);

  expect(savedProject.cards[0]?.themeId).toBe('contour-lines');
  expect(savedProject.themes.some((theme) => theme.id === 'contour-lines')).toBe(true);
});

test('renders edge text edits into the social canvas', async ({ page }, testInfo) => {
  const sourcePath = testInfo.outputPath('sample-copy.png');
  await writeFile(sourcePath, Buffer.from(SAMPLE_PNG_BASE64, 'base64'));

  await page.goto('/');
  await page.getByTestId('source-file-input').setInputFiles(sourcePath);
  await openSection(page, 'Text');

  await page.getByRole('button', { name: 'Bottom', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('Frame screenshots with glyph texture');
  await page
    .getByRole('textbox', { name: 'Subtitle', exact: true })
    .fill('A social card draft from local image data.');

  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
    'Frame screenshots with glyph texture'
  );
  await expect(
    page.getByRole('textbox', { name: 'Subtitle', exact: true })
  ).toHaveValue('A social card draft from local image data.');
});
