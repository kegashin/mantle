import { expect, test } from '@playwright/test';

test('renders the Glyphrame editor shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('GLYPHRAME', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Image', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose image' })).toBeVisible();
  await expect(page.getByText(/drop a screenshot/i)).toBeVisible();
  await expect(page.getByText('Canvas size', { exact: true })).toBeVisible();
  await expect(page.getByText('Style', { exact: true })).toBeVisible();
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

test('surface and style controls are available without social size presets', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Free' })).toBeVisible();
  await expect(page.getByRole('button', { name: '16:9' })).toBeVisible();
  await expect(page.getByRole('button', { name: '9:16' })).toBeVisible();
  await expect(page.getByRole('button', { name: /LinkedIn feed/i })).toHaveCount(0);

  await expect(page.getByText('Scanline strength', { exact: true })).toBeVisible();
  await expect(page.getByText('Glyph amount', { exact: true })).toBeVisible();
  await expect(page.getByText('Sweep glow', { exact: true })).toBeVisible();
  await expect(page.getByText('Canvas inset', { exact: true })).toBeVisible();
  await expect(page.getByText('Chrome gap', { exact: true })).toBeVisible();
  await expect(page.getByText('Frame padding', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Padding', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Panel', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Glass', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Frosted glass/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Clear glass/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Soft panel/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Glass panel/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Glass', exact: true }).click();
  await expect(page.getByText('Glass tint', { exact: true })).toBeVisible();
  await expect(page.getByText('Glass edge', { exact: true })).toBeVisible();
  await expect(page.getByText('Glass opacity', { exact: true })).toBeVisible();
  await page.getByRole('slider', { name: 'Glass opacity' }).fill('0.46');
  await expect(page.getByRole('slider', { name: 'Glass opacity' })).toHaveValue('0.46');
  await page.getByRole('button', { name: 'macOS window', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Bar text' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Bar text' }).fill('glyphrame.local');
  await expect(page.getByRole('textbox', { name: 'Bar text' })).toHaveValue('glyphrame.local');
  await expect(page.getByRole('slider', { name: 'Chrome gap' })).toHaveValue('32');
  await expect(page.getByText('Render failed.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'None', exact: true }).first().click();
  await expect(page.getByRole('slider', { name: 'Chrome gap' })).toHaveCount(0);
  await page.getByRole('slider', { name: 'Glyph amount' }).fill('0');
  await expect(page.getByRole('slider', { name: 'Glyph amount' })).toHaveValue('0');
  await page.getByRole('button', { name: /Randomize/i }).click();
  await expect(page.getByText('Background randomized')).toBeVisible();

  await page.getByRole('button', { name: /Contour Lines/i }).first().click();

  await expect(page.getByRole('button', { name: /Terminal Scanline/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Contour Lines/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Dot Grid/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Default/i }).first()).toBeVisible();
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
  await expect(page.getByRole('button', { name: /Mono Poster/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Launch Ink/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Poster Mosaic/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Halftone/i })).toHaveCount(0);

  await page.getByRole('button', { name: /Default/i }).first().click();

  await expect(page.getByText('Dot opacity', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Foreground', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Accent', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Randomize/i })).toHaveCount(0);
});

test('custom canvas dimensions and aspect ratio update the active surface', async ({ page }) => {
  await page.goto('/');

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

  await page.getByRole('button', { name: 'Free' }).click();
  await page.getByRole('spinbutton', { name: 'Width' }).fill('1200');
  await page.getByRole('spinbutton', { name: 'Width' }).press('Enter');

  await expect(page.getByRole('spinbutton', { name: 'Width' })).toHaveValue('1200');
  await expect(page.getByRole('spinbutton', { name: 'Height' })).toHaveValue('1000');

  await page.getByRole('button', { name: 'Custom', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Ratio W' }).fill('3');
  await page.getByRole('spinbutton', { name: 'Ratio W' }).press('Enter');
  await page.getByRole('spinbutton', { name: 'Ratio H' }).fill('2');
  await page.getByRole('spinbutton', { name: 'Ratio H' }).press('Enter');

  await expect(page.getByRole('spinbutton', { name: 'Width' })).toHaveValue('1200');
  await expect(page.getByRole('spinbutton', { name: 'Height' })).toHaveValue('800');
});
