import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8U8AAAAASUVORK5CYII=';

test('loads a local image into the active Glyphrame card', async ({ page }, testInfo) => {
  const sourcePath = testInfo.outputPath('sample.png');
  await writeFile(sourcePath, Buffer.from(SAMPLE_PNG_BASE64, 'base64'));

  await page.goto('/');
  await page.getByTestId('source-file-input').setInputFiles(sourcePath);

  await expect(page.getByText('sample.png', { exact: true })).toBeVisible();
  await expect(page.getByText('sample', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/1 × 1/).first()).toBeVisible();
});

test('renders edge text edits into the social canvas', async ({ page }, testInfo) => {
  const sourcePath = testInfo.outputPath('sample-copy.png');
  await writeFile(sourcePath, Buffer.from(SAMPLE_PNG_BASE64, 'base64'));

  await page.goto('/');
  await page.getByTestId('source-file-input').setInputFiles(sourcePath);

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
