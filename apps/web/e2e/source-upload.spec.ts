import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z8BQDwAFgwJ/lbq8jAAAAABJRU5ErkJggg==';

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

test('uses a local image as the canvas backdrop', async ({ page }, testInfo) => {
  const backgroundPath = testInfo.outputPath('background.png');
  await writeFile(backgroundPath, Buffer.from(SAMPLE_PNG_BASE64, 'base64'));

  await page.goto('/');
  await page.getByRole('button', { name: /Image Backdrop/i }).click();
  await page.getByTestId('source-file-input').setInputFiles(backgroundPath);

  await expect(page.getByText('Backdrop imported')).toBeVisible();
  await expect(page.getByText('background.png', { exact: true })).toBeVisible();
});

test('downloads the composed image', async ({ page }, testInfo) => {
  const sourcePath = testInfo.outputPath('sample-download.png');
  await writeFile(sourcePath, Buffer.from(SAMPLE_PNG_BASE64, 'base64'));

  await page.goto('/');
  await page.getByTestId('source-file-input').setInputFiles(sourcePath);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Download settings' })
    .getByRole('button', { name: 'Download', exact: true })
    .click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
});

test('creates and edits text layers', async ({ page }, testInfo) => {
  const sourcePath = testInfo.outputPath('sample-copy.png');
  await writeFile(sourcePath, Buffer.from(SAMPLE_PNG_BASE64, 'base64'));

  await page.goto('/');
  await page.getByTestId('source-file-input').setInputFiles(sourcePath);
  await openSection(page, 'Text');

  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Text layer 1' })).toHaveValue(
    'Text 1'
  );
  await page
    .getByRole('textbox', { name: 'Text layer 1' })
    .fill('Frame screenshots with texture');
  await expect(page.getByRole('textbox', { name: 'Text layer 1' })).toHaveValue(
    'Frame screenshots with texture'
  );

  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Text layer 2' })).toHaveValue(
    'Text 2'
  );
  await page
    .getByRole('textbox', { name: 'Text layer 2' })
    .fill('A social card draft.');
  await expect(page.getByRole('textbox', { name: 'Text layer 2' })).toHaveValue(
    'A social card draft.'
  );

  const layerInputs = page.locator('input[aria-label^="Text layer"]');
  await expect(layerInputs.nth(0)).toHaveValue('A social card draft.');
  await page
    .getByRole('button', { name: 'Drag A social card draft.' })
    .dragTo(page.getByRole('button', { name: 'Drag Frame screenshots with texture' }));
  await expect(layerInputs.nth(0)).toHaveValue('Frame screenshots with texture');

  const textHotspot = page.getByTestId('text-layer-hotspot').first();
  await textHotspot.click({ force: true });
  await expect(page.locator('textarea')).toHaveCount(1);
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Drag A social card draft.' }).click();
  await page.keyboard.press('Control+D');
  await expect(layerInputs).toHaveCount(3);
  await page.keyboard.press('Delete');
  await expect(layerInputs).toHaveCount(2);
  await expect(page.getByText('Layers', { exact: true })).toBeVisible();
});
