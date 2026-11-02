import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import fs from 'node:fs/promises';
import type { Project } from '../src/model';
async function savedProject(page: Page): Promise<Project> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Сохранить JSON', exact: true }).click();
  return JSON.parse(await fs.readFile((await (await pending).path())!, 'utf8'));
}
async function settled(page: Page) {
  await expect
    .poll(() =>
      page
        .getByTestId('canvas')
        .evaluate(
          (el) => el.parentElement!.getAnimations().filter((a) => a.playState === 'running').length,
        ),
    )
    .toBe(0);
}
test('редизайн: три варианта по метафоре и ручная доводка', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto('/');
  await page.getByLabel('Описание композиции', { exact: true }).fill('Знания — сила');
  await page.getByRole('button', { name: 'Разобрать и собрать', exact: true }).click();
  await expect(page.getByTestId('canvas-item')).toHaveCount(4);
  await expect(page.getByTestId('variant-balanced')).toHaveAttribute('aria-pressed', 'true');
  for (const key of ['balanced', 'offset', 'headline'])
    await expect(page.getByTestId(`variant-${key}`)).toBeVisible();
  await settled(page);
  await page.screenshot({ path: 'test-results/redesign-learning.png', fullPage: true });
  await page.getByTestId('variant-offset').click();
  await expect(page.getByTestId('variant-offset')).toHaveAttribute('aria-pressed', 'true');
  await settled(page);
  await page.screenshot({ path: 'test-results/redesign-diagonal.png', fullPage: true });
  await page.getByRole('button', { name: 'Музыкальная пауза ↗', exact: true }).click();
  await expect(page.getByTestId('canvas-item')).toHaveCount(3);
  await settled(page);
  await page.screenshot({ path: 'test-results/redesign-music.png', fullPage: true });
  await page.getByRole('button', { name: 'Под заголовок ↗', exact: true }).click();
  await settled(page);
  await page.screenshot({ path: 'test-results/redesign-finance.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('редизайн: масштаб холста не меняет объекты, поворот маркером и горячие клавиши', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Телефон', exact: true }).click();
  const original = await savedProject(page);
  await page.getByRole('button', { name: 'Увеличить холст', exact: true }).click();
  await page.getByRole('button', { name: 'Увеличить холст', exact: true }).click();
  await settled(page);
  expect((await savedProject(page)).scale).toBe(original.scale);
  const item = page.getByTestId('canvas-item');
  await item.scrollIntoViewIfNeeded();
  let rect = (await item.locator(':scope > rect').first().boundingBox())!;
  const before = await item.getAttribute('transform');
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 25, rect.y + rect.height / 2 + 15, { steps: 6 });
  await page.mouse.up();
  await expect(item).not.toHaveAttribute('transform', before!);
  const handle = page.getByTestId('rotation-handle');
  await handle.scrollIntoViewIfNeeded();
  rect = (await handle.boundingBox())!;
  await page.keyboard.down('Shift');
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 40, rect.y + rect.height / 2 + 25, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const rotated = await savedProject(page);
  expect(rotated.items[0].rotation).not.toBe(0);
  expect(rotated.items[0].rotation % 15).toBe(0);
  await page.keyboard.press('Control+z');
  expect((await savedProject(page)).items[0].rotation).toBe(0);
  const previous = (await savedProject(page)).items[0];
  await page.keyboard.press('Shift+ArrowRight');
  expect((await savedProject(page)).items[0].x).toBeCloseTo(previous.x + 10);
  await page.keyboard.press('Control+d');
  await expect(page.getByTestId('canvas-item')).toHaveCount(2);
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('canvas-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Вписать холст', exact: true }).click();
  await settled(page);
});
test('редизайн: варианты, отрицание и слои сохраняют только выбранные исходники', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Описание композиции', { exact: true }).fill('Поймать ритм без телефона');
  await page.getByRole('button', { name: 'Разобрать и собрать', exact: true }).click();
  const first = await savedProject(page);
  expect(first.items).toHaveLength(2);
  await page.getByText('Как подобраны предметы', { exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Исключены по условию');
  await page.getByText('Как подобраны предметы', { exact: true }).click();
  expect(
    first.items.every((i) => first.assets.find((a) => a.id === i.assetId)?.family !== 'phone'),
  ).toBe(true);
  await page.getByTestId('variant-headline').click();
  await page.getByText('Как подобраны предметы', { exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Исключены по условию');
  await page.getByText('Как подобраны предметы', { exact: true }).click();
  const second = await savedProject(page);
  expect(second.items.map((i) => i.assetId).sort()).toEqual(
    first.items.map((i) => i.assetId).sort(),
  );
  expect(second.items.map((i) => [i.x, i.y])).not.toEqual(first.items.map((i) => [i.x, i.y]));
  await page.getByLabel('Детализация', { exact: true }).selectOption('S');
  await expect(page.getByTestId('variant-headline')).toBeVisible();
  const small = await savedProject(page);
  expect(small.detail).toBe('S');
  expect(
    small.items.every((i) => small.assets.find((a) => a.id === i.assetId)?.detail === 'S'),
  ).toBe(true);
  await page.getByRole('button', { name: /^Слои/ }).click();
  await expect(page.locator('.layer-list li')).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('variant-headline')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
