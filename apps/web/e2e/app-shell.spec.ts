import { expect, test, type Page } from '@playwright/test';

async function openSection(page: Page, name: string): Promise<void> {
  const section = page.getByRole('button', { name, exact: true });
  if ((await section.getAttribute('aria-expanded')) !== 'true') {
    await section.click();
  }
}

test('renders the Mantle editor shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('MANTLE', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import media', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose media' })).toBeVisible();
  await expect(page.getByText('Drop media', { exact: true })).toBeVisible();
  await expect(page.getByText('Canvas size', { exact: true })).toBeVisible();
  await expect(page.getByText('Styles', { exact: true })).toBeVisible();
  const smokeThumbnail = page.getByTestId('style-thumbnail-smoke-veil');
  await expect(smokeThumbnail).toHaveAttribute(
    'data-thumbnail-status',
    'ready',
    { timeout: 10_000 }
  );
  const smokeThumbnailMetrics = await smokeThumbnail.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const image = node.querySelector('img');

    return {
      width: rect.width,
      height: rect.height,
      naturalWidth: image?.naturalWidth ?? 0,
      naturalHeight: image?.naturalHeight ?? 0
    };
  });
  expect(smokeThumbnailMetrics.width).toBeGreaterThan(40);
  expect(smokeThumbnailMetrics.naturalWidth).toBeGreaterThan(0);
  expect(smokeThumbnailMetrics.width / smokeThumbnailMetrics.height).toBeCloseTo(
    16 / 9,
    1
  );
  expect(
    smokeThumbnailMetrics.naturalWidth / smokeThumbnailMetrics.naturalHeight
  ).toBeCloseTo(16 / 9, 1);
  const imageThumbnail = page.getByTestId('style-thumbnail-image-background');
  await expect(imageThumbnail).toHaveAttribute(
    'data-thumbnail-variant',
    'image'
  );
  const imageThumbnailStyle = await imageThumbnail.evaluate((node) => {
    const fallback = node.querySelector('span');

    return {
      backgroundImage: getComputedStyle(node).backgroundImage,
      fallbackBackgroundImage: fallback
        ? getComputedStyle(fallback).backgroundImage
        : '',
      iconCount: node.querySelectorAll('svg').length
    };
  });
  expect(imageThumbnailStyle.backgroundImage).not.toContain('radial-gradient');
  expect(imageThumbnailStyle.fallbackBackgroundImage).toBe('none');
  expect(imageThumbnailStyle.iconCount).toBe(1);
});

test('desktop app shell stays pinned to the viewport bottom edge', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.goto('/');

  const metrics = await page.evaluate(() => {
    const appPage = document.querySelector('#root > div');
    const rect = appPage?.getBoundingClientRect();

    return {
      top: rect?.top ?? -1,
      bottom: rect?.bottom ?? -1,
      viewportHeight: window.innerHeight
    };
  });

  expect(metrics.top).toBe(0);
  expect(Math.abs(metrics.bottom - metrics.viewportHeight)).toBeLessThanOrEqual(1);
});

test('motion export popover groups format, size, motion, and quality settings', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Motion', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Animation', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Backdrop motion/ })).toBeChecked();
  await expect(page.getByRole('slider', { name: 'Motion speed' })).toBeVisible();
  await page.getByRole('slider', { name: 'Motion speed' }).fill('1.5');
  await expect(page.getByRole('slider', { name: 'Motion speed' })).toHaveValue('1.5');
  await expect(page.getByRole('button', { name: '1.50×' })).toBeVisible();
  await page.getByRole('button', { name: 'Download', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Download settings' });
  await expect(dialog.getByText('Format', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Size', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Motion', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Quality', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('group', { name: 'MP4 presets' })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /Audio/i })).toBeDisabled();
});

test('motion export blocks oversized MP4 settings before rendering', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Motion', exact: true }).click();
  await page.getByRole('button', { name: 'Download', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Download settings' });
  await dialog.getByRole('slider', { name: 'Scale' }).fill('5');

  await expect(dialog.getByText('Export settings need changes')).toBeVisible();
  await expect(dialog.getByText(/MP4 export is too large/i)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Download', exact: true })).toBeDisabled();
});

test('surface and style controls are available without social size presets', async ({ page }) => {
  await page.goto('/');
  await openSection(page, 'Canvas size');

  await expect(page.getByRole('button', { name: 'Freeform' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Custom ratio' })).toBeVisible();
  await expect(page.getByRole('button', { name: '16:9' })).toBeVisible();
  await expect(page.getByRole('button', { name: '9:16' })).toBeVisible();
  await expect(page.getByRole('button', { name: /LinkedIn feed/i })).toHaveCount(0);

  await expect(page.getByText('Smoke detail', { exact: true })).toBeVisible();
  await expect(page.getByText('Glow', { exact: true })).toBeVisible();
  await expect(page.getByText('Grain', { exact: true })).toBeVisible();
  await expect(page.getByText('Outer padding', { exact: true })).toBeVisible();
  await expect(page.getByText('Inner padding', { exact: true })).toBeVisible();
  await expect(page.getByText('Frame padding', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Padding', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Solid', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Glass', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Frosted glass/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Clear glass/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Soft panel/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Glass panel/i })).toHaveCount(0);
  await expect(page.getByText('Panel edge', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Glass', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Clear', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tinted', exact: true })).toHaveCount(0);
  await expect(page.getByText('Glass color', { exact: true })).toBeVisible();
  await expect(page.getByText('Glass edge', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Opacity', { exact: true })).toBeVisible();
  await expect(page.getByText('Blur', { exact: true })).toBeVisible();
  await expect(page.getByText('Edge highlight', { exact: true })).toBeVisible();
  await page.getByRole('slider', { name: 'Opacity' }).fill('0.46');
  await expect(page.getByRole('slider', { name: 'Opacity' })).toHaveValue('0.46');
  await page.getByRole('slider', { name: 'Blur' }).fill('5');
  await expect(page.getByRole('slider', { name: 'Blur' })).toHaveValue('5');
  await page.getByRole('slider', { name: 'Edge highlight' }).fill('0.47');
  await expect(page.getByRole('slider', { name: 'Edge highlight' })).toHaveValue('0.47');
  await page.getByRole('button', { name: 'macOS window', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Window title' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Window title' }).fill('mantle.local');
  await expect(page.getByRole('textbox', { name: 'Window title' })).toHaveValue('mantle.local');
  await expect(page.getByRole('slider', { name: 'Inner padding' })).toBeVisible();
  await expect(page.getByText('Render failed.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'None', exact: true }).first().click();
  await expect(page.getByRole('slider', { name: 'Inner padding' })).toHaveCount(0);
  await page.getByRole('slider', { name: 'Smoke detail' }).fill('0');
  await expect(page.getByRole('slider', { name: 'Smoke detail' })).toHaveValue('0');
  await page.getByRole('button', { name: /Randomize/i }).click();
  await expect(page.getByText('Background randomized')).toHaveCount(0);

  await page.getByRole('button', { name: /Aurora Gradient/i }).first().click();
  await expect(page.getByText('Palette colors', { exact: true })).toBeVisible();
  await expect(page.getByText('Glow', { exact: true })).toBeVisible();
  await expect(page.getByText('Spread', { exact: true })).toBeVisible();
  await expect(page.getByText('Grain', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Randomize/i })).toBeVisible();

  await page.getByRole('button', { name: /Contour Lines/i }).first().click();

  await expect(page.getByRole('button', { name: /Terminal Scanline/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Aurora Gradient/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Contour Lines/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Dot Grid/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Studio Solid/i }).first()).toBeVisible();
  await expect(page.getByText('Line density', { exact: true })).toBeVisible();
  await expect(page.getByText('Relief', { exact: true })).toBeVisible();
  await expect(page.getByText('Accent glow', { exact: true })).toBeVisible();
  await expect(page.getByText('Glyph amount', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Randomize/i })).toBeVisible();

  await page.getByRole('button', { name: /Dot Grid/i }).first().click();

  await expect(page.getByText('Dot opacity', { exact: true })).toBeVisible();
  await expect(page.getByText('Dot density', { exact: true })).toBeVisible();
  await expect(page.getByText('Guide stripe', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Accent', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Randomize/i })).toHaveCount(0);
  await expect(page.getByText('Relief', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: /Studio Solid/i }).first().click();

  await expect(page.getByText('Dot opacity', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Foreground', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Accent', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Randomize/i })).toHaveCount(0);
});

test('custom canvas dimensions and aspect ratio update the active surface', async ({ page }) => {
  await page.goto('/');
  await openSection(page, 'Canvas size');

  await page.getByRole('spinbutton', { name: 'Width' }).fill('1920');
  await page.getByRole('spinbutton', { name: 'Width' }).press('Enter');
  await page.getByRole('spinbutton', { name: 'Height' }).fill('1080');
  await page.getByRole('spinbutton', { name: 'Height' }).press('Enter');

  await expect(page.getByRole('spinbutton', { name: 'Width' })).toHaveValue('1920');
  await expect(page.getByRole('spinbutton', { name: 'Height' })).toHaveValue('1080');

  await page.getByRole('button', { name: '4:5' }).click();

  await expect(page.getByRole('spinbutton', { name: 'Width' })).toHaveValue('1920');
  await expect(page.getByRole('spinbutton', { name: 'Height' })).toHaveValue('2400');

  await page.getByRole('spinbutton', { name: 'Width' }).fill('1600');
  await page.getByRole('spinbutton', { name: 'Width' }).press('Enter');
  await expect(page.getByRole('spinbutton', { name: 'Height' })).toHaveValue('2000');

  await page.getByRole('spinbutton', { name: 'Height' }).fill('1000');
  await page.getByRole('spinbutton', { name: 'Height' }).press('Enter');
  await expect(page.getByRole('spinbutton', { name: 'Width' })).toHaveValue('800');

  await page.getByRole('button', { name: 'Freeform' }).click();
  await page.getByRole('spinbutton', { name: 'Width' }).fill('1200');
  await page.getByRole('spinbutton', { name: 'Width' }).press('Enter');

  await expect(page.getByRole('spinbutton', { name: 'Width' })).toHaveValue('1200');
  await expect(page.getByRole('spinbutton', { name: 'Height' })).toHaveValue('1000');

  await page.getByRole('button', { name: 'Custom ratio', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Ratio W' }).fill('3');
  await page.getByRole('spinbutton', { name: 'Ratio W' }).press('Enter');
  await page.getByRole('spinbutton', { name: 'Ratio H' }).fill('2');
  await page.getByRole('spinbutton', { name: 'Ratio H' }).press('Enter');

  await expect(page.getByRole('spinbutton', { name: 'Width' })).toHaveValue('1200');
  await expect(page.getByRole('spinbutton', { name: 'Height' })).toHaveValue('800');
});
