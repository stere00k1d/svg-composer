import { describe, it, expect } from 'vitest';
import { originalLibrary } from './library';
import { localPlanner, parsePrompt, validatePlan } from './planner';
import { bounds, FORMATS } from './model';
import type { Detail, Format, Template } from './model';
import { compositionRegion } from './composition';
const library = originalLibrary();
describe('смысловой словарь без генерации', () => {
  it.each([
    ['Знания — сила', 'book', ['book', 'phone', 'lamp', 'pen']],
    ['Поймать ритм', 'headphones', ['headphones', 'phone', 'flowers']],
    ['Финансовая подушка', 'wallet', ['wallet', 'coin', 'phone']],
    ['Яркие идеи', 'lamp', ['lamp', 'puzzle', 'pen']],
    ['Всё на своих местах', 'folder', ['folder', 'pen', 'phone', 'coin']],
  ] as const)('%s выбирает существующие исходники по теме', (text, focus, families) => {
    for (const detail of ['S', 'L']) {
      const assets = library.filter((a) => a.detail === detail);
      const r = parsePrompt(text, assets);
      expect(r.matches.map((a) => a.family)).toEqual(families);
      expect(r.matches.find((a) => a.id === r.focusId)?.family).toBe(focus);
      expect(r.explanation.join(' ')).toContain('не LLM');
      for (const a of r.matches) expect(assets.some((v) => v.id === a.id)).toBe(true);
    }
  });
  it('распознаёт словоформы и локальное условие фонового состояния', () => {
    const r = parsePrompt(
      'телефоном на фоне наушников',
      library.filter((a) => a.detail === 'L'),
    );
    expect(r.matches.map((a) => [a.family, a.role])).toEqual([
      ['headphones', 'background'],
      ['phone', 'main'],
    ]);
  });
  it('исключает предмет после слова без, не подставляет неизвестный предмет', () => {
    const r = parsePrompt(
      'поймать ритм без телефона',
      library.filter((a) => a.detail === 'L'),
    );
    expect(r.matches.some((a) => a.family === 'phone')).toBe(false);
    expect(r.matches.some((a) => a.family === 'headphones')).toBe(true);
    expect(parsePrompt('дракон в облаках', library).matches).toEqual([]);
    expect(parsePrompt('цветовая схема', library).matches).toEqual([]);
  });
  it('не создаёт отсутствующие компоненты для известной темы', () => {
    const assets = library.filter((a) => a.family === 'wallet' && a.detail === 'S');
    expect(parsePrompt('финансовая подушка', assets).matches.map((a) => a.family)).toEqual([
      'wallet',
    ]);
  });
});
describe('композиции вокруг фокуса', () => {
  const requests = (Object.keys(FORMATS) as Format[]).flatMap((format) =>
    (['S', 'L'] as Detail[]).flatMap((detail) =>
      (['balanced', 'offset', 'headline'] as Template[]).flatMap((template) =>
        [
          'Знания сила',
          'Поймать ритм',
          'Финансовая подушка',
          'Яркие идеи',
          'Всё на своих местах',
          'Знаки внимания',
        ].map((prompt) => ({
          format,
          detail,
          template,
          prompt,
        })),
      ),
    ),
  );
  it.each(requests)(
    '$format / $detail / $template / $prompt: границы и контролируемые пересечения',
    ({ format, detail, template, prompt }) => {
      const parsed = parsePrompt(
        prompt,
        library.filter((a) => a.detail === detail),
      );
      const size = FORMATS[format];
      const request = {
        assets: parsed.matches,
        ...size,
        safe: 40,
        template,
        focusId: parsed.focusId,
      };
      const plan = localPlanner.plan(request);
      validatePlan(plan, request);
      expect(plan.focusId).toBe(parsed.focusId);
      expect(plan.placements.map((i) => i.assetId).sort()).toEqual(
        parsed.matches.map((a) => a.id).sort(),
      );
      expect(plan.placements.every((i) => !('scale' in i))).toBe(true);
      for (let i = 0; i < plan.placements.length; i++) {
        const a = parsed.matches.find((a) => a.id === plan.placements[i].assetId)!;
        const ba = bounds(a, { ...plan.placements[i], id: '' }, plan.scale);
        if (template === 'headline') {
          const region = compositionRegion(request);
          expect(ba.left).toBeGreaterThanOrEqual(region.x - 0.001);
          expect(ba.top).toBeGreaterThanOrEqual(region.y - 0.001);
        }
        if (a.role === 'background') {
          const visibleX =
            Math.max(0, Math.min(size.width, ba.right) - Math.max(0, ba.left)) /
            (ba.right - ba.left);
          const visibleY =
            Math.max(0, Math.min(size.height, ba.bottom) - Math.max(0, ba.top)) /
            (ba.bottom - ba.top);
          expect(visibleX).toBeGreaterThanOrEqual(0.6499);
          expect(visibleY).toBeGreaterThanOrEqual(0.6499);
          continue;
        }
        const region = compositionRegion(request);
        expect(ba.left).toBeGreaterThanOrEqual(region.x - 0.001);
        expect(ba.top).toBeGreaterThanOrEqual(region.y - 0.001);
        for (let j = i + 1; j < plan.placements.length; j++) {
          const b = parsed.matches.find((a) => a.id === plan.placements[j].assetId)!;
          if (b.role === 'background') continue;
          const bb = bounds(b, { ...plan.placements[j], id: '' }, plan.scale);
          const intersection =
            Math.max(0, Math.min(ba.right, bb.right) - Math.max(ba.left, bb.left)) *
            Math.max(0, Math.min(ba.bottom, bb.bottom) - Math.max(ba.top, bb.top));
          const ratio =
            intersection /
            Math.min(
              (ba.right - ba.left) * (ba.bottom - ba.top),
              (bb.right - bb.left) * (bb.bottom - bb.top),
            );
          const stack =
            [a.family, b.family].some((f) => ['book', 'folder'].includes(f)) &&
            [a.family, b.family].some((f) => ['phone', 'puzzle', 'pen'].includes(f));
          expect(ratio, `${a.family}/${b.family}`).toBeLessThanOrEqual(stack ? 0.8801 : 0.1301);
        }
      }
    },
  );
  it('крупный фон возле небольшой монеты не исчезает за холстом', () => {
    const assets = library.filter(
      (a) =>
        a.detail === 'L' &&
        ((a.family === 'coin' && a.role === 'main') ||
          (a.family === 'book' && a.role === 'background')),
    );
    const plan = localPlanner.plan({
      assets,
      width: 630,
      height: 1200,
      safe: 40,
      template: 'balanced',
    });
    const bg = assets.find((a) => a.role === 'background')!;
    const i = plan.placements.find((i) => i.assetId === bg.id)!;
    const b = bounds(bg, { ...i, id: '' }, plan.scale);
    expect(
      (Math.min(630, b.right) - Math.max(0, b.left)) / (b.right - b.left),
    ).toBeGreaterThanOrEqual(0.6499);
  });
  it('три решения воспроизводимы и отличаются расположением', () => {
    const parsed = parsePrompt(
      'поймать ритм',
      library.filter((a) => a.detail === 'L'),
    );
    const signatures = new Set<string>();
    for (const template of ['balanced', 'offset', 'headline'] as Template[]) {
      const request = {
        assets: parsed.matches,
        width: 1200,
        height: 630,
        safe: 40,
        template,
        focusId: parsed.focusId,
      };
      const a = localPlanner.plan(request);
      expect(a).toEqual(localPlanner.plan(request));
      expect(a).toEqual(localPlanner.plan({ ...request, assets: [...request.assets].reverse() }));
      signatures.add(JSON.stringify(a.placements));
    }
    expect(signatures.size).toBe(3);
  });
});
