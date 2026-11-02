import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import fs from 'node:fs/promises';
import type { Project } from '../src/model';
async function download(page: Page, name: RegExp) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name }).click();
  return fs.readFile((await (await pending).path())!, 'utf8');
}
const project = async (page: Page): Promise<Project> =>
  JSON.parse(await download(page, /^Сохранить JSON$/));
test('реальные S/L, поворот, дубль, порядок слоёв, смена состояния и удаление', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Книга', exact: true }).click();
  await page.getByLabel('Фон холста', { exact: true }).selectOption('original-backdrop-lavender');
  await page.getByLabel('Поворот', { exact: true }).fill('25');
  await page.getByRole('button', { name: 'Дублировать', exact: true }).click();
  await expect(page.getByTestId('canvas-item')).toHaveCount(2);
  const initial = await project(page);
  expect(initial.items[1].rotation).toBe(25);
  await page.getByRole('button', { name: '↓ Ниже', exact: true }).click();
  const reordered = await project(page);
  expect(reordered.items[0].id).toBe(initial.items[1].id);
  await page.getByRole('button', { name: 'Сменить состояние', exact: true }).click();
  expect((await project(page)).items[0].assetId).toBe('original-L-book-background');
  await page.getByLabel('Детализация', { exact: true }).selectOption('S');
  const small = await project(page);
  expect(small.detail).toBe('S');
  expect(small.scale).toBeCloseTo(reordered.scale * 2);
  expect(small.backdropId).toBe('original-backdrop-S-lavender');
  expect(small.items.every((i) => i.assetId.startsWith('original-S-'))).toBe(true);
  expect(small.assets.find((a) => a.id === 'original-S-book-main')?.width).toBe(723);
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(page.getByTestId('canvas-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(page.getByTestId('canvas-item')).toHaveCount(2);
  expect(errors).toEqual([]);
});
test('автосборка, безопасные форматы, палитра, экспорт и восстановление JSON', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Книга', 'Телефон', 'Лампа'])
    await page.getByLabel(`В автосборку: ${name}`, { exact: true }).check();
  await page.getByRole('button', { name: 'Собрать композицию →', exact: true }).click();
  await expect(page.getByTestId('canvas-item')).toHaveCount(3);
  const initial = await project(page);
  await page.getByRole('button', { name: 'Вертикальный', exact: true }).click();
  const portrait = await project(page);
  const k = portrait.scale / initial.scale;
  initial.items.forEach((i, n) =>
    expect(portrait.items[n].x - portrait.width / 2).toBeCloseTo((i.x - initial.width / 2) * k),
  );
  await page.getByRole('button', { name: 'Горизонтальный', exact: true }).click();
  expect((await project(page)).scale).toBeCloseTo(initial.scale);
  await page.getByRole('button', { name: 'Бирюза', exact: false }).click();
  await page.getByLabel('Фон холста', { exact: true }).selectOption('original-backdrop-turquoise');
  const before = await download(page, /^Экспорт SVG/);
  expect(before).not.toContain('<image');
  expect(before).not.toContain('stroke-dasharray');
  expect(before).toContain('overflow="hidden"');
  const json = await project(page);
  await page.getByRole('button', { name: 'Телефон', exact: true }).click();
  await expect(page.getByTestId('canvas-item')).toHaveCount(4);
  await page.getByLabel('Открыть JSON', { exact: true }).setInputFiles({
    name: 'saved.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(json)),
  });
  await expect(page.getByTestId('canvas-item')).toHaveCount(3);
  expect(await download(page, /^Экспорт SVG/)).toBe(before);
  await page.getByText('Сохранено в браузере', { exact: true }).waitFor();
  await page.reload();
  await expect(page.getByTestId('canvas-item')).toHaveCount(3);
});
test('текстовый сценарий выбирает существующие компоненты и показывает пропуски', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('Собрать по текстовому описанию', { exact: false }).click();
  await page
    .getByLabel('Описание композиции', { exact: true })
    .fill('телефон и дракон под заголовок');
  await page.getByRole('button', { name: 'Разобрать и собрать', exact: true }).click();
  await expect(page.getByTestId('canvas-item')).toHaveCount(1);
  await expect(page.getByRole('log')).toContainText('Не распознано и не добавлено: дракон');
  expect((await project(page)).items[0].assetId).toBe('original-L-phone-main');
  await page.getByLabel('Описание композиции', { exact: true }).fill('дракон');
  await page.getByRole('button', { name: 'Разобрать и собрать', exact: true }).click();
  await expect(page.getByTestId('canvas-item')).toHaveCount(1);
});
test('загрузка собственной палитры и отказ от повреждённого JSON и PNG', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Телефон', exact: true }).click();
  const palette = {
    name: 'Тестовая',
    background: ['#aabbcc', '#bbccdd', '#ccddee'],
    objects: ['#112233', '#223344', '#334455'],
    neutral: ['#101010', '#ffffff'],
  };
  await page.getByLabel('Загрузить палитру JSON', { exact: true }).setInputFiles({
    name: 'palette.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(palette)),
  });
  await expect(page.getByRole('status')).toContainText('Тестовая');
  expect((await project(page)).palette).toEqual(palette);
  await page.getByLabel('Открыть JSON', { exact: true }).setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":99}'),
  });
  await expect(page.getByRole('status')).toContainText('повреждённый проект');
  await expect(page.getByTestId('canvas-item')).toHaveCount(1);
  await page.getByLabel('Импорт SVG', { exact: true }).setInputFiles({
    name: 'fake.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="data:image/png;base64,xx"/></svg>',
    ),
  });
  await expect(page.getByRole('status')).toContainText('Элемент image не поддерживается');
});
test('три композиции из библиотеки и мобильный интерфейс', async ({ page }) => {
  await page.goto('/');
  const names = ['Рабочий стол ↗', 'Музыкальная пауза ↗', 'Под заголовок ↗'];
  await fs.mkdir('examples', { recursive: true });
  for (const [n, name] of names.entries()) {
    await page.getByRole('button', { name, exact: true }).click();
    const p = await project(page);
    expect(p.items.length).toBe([5, 3, 3][n]);
    expect(p.items.every((i) => i.assetId.startsWith('original-L-'))).toBe(true);
    expect(p.format).toBe(['landscape', 'square', 'portrait'][n]);
    const svg = await download(page, /^Экспорт SVG/);
    await fs.writeFile(`examples/composition-${n + 1}.svg`, svg);
    await fs.writeFile(`examples/composition-${n + 1}.json`, JSON.stringify(p, null, 2));
    await page.screenshot({ path: `test-results/demo-${n + 1}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});
