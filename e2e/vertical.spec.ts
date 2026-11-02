import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const source =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 80 100"><path d="M10 20H90V120H10Z" fill="#b44331"/></svg>';
test('импорт → добавление → перемещение → векторный экспорт', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Импорт SVG', { exact: true })
    .setInputFiles({ name: 'tile.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(source) });
  await page.getByRole('button', { name: 'tile', exact: true }).click();
  const item = page.getByTestId('canvas-item');
  await expect(item).toHaveCount(1);
  const before = await item.getAttribute('transform');
  await item.scrollIntoViewIfNeeded();
  const box = (await item.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 30, { steps: 8 });
  await page.mouse.up();
  await expect(item).not.toHaveAttribute('transform', before!);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Экспорт SVG/ }).click();
  const file = await downloadPromise;
  const xml = await fs.readFile((await file.path())!, 'utf8');
  expect(xml).toContain('viewBox="10 20 80 100"');
  expect(xml).toContain('d="M10 20H90V120H10Z"');
  expect(xml).toContain('fill="#b44331"');
  expect(xml).not.toContain('<image');
  expect(xml).not.toContain('<rect');
});
