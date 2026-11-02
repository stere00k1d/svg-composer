import { describe, it, expect } from 'vitest';
import { originalLibrary } from './library';
import { importSvg, assetMarkup, exportSvg } from './svg';
import { emptyProject, adaptFormat, createItem, FORMATS, outsideSafe } from './model';
import type { Asset, Format, Project, Template } from './model';
import { assemble, parsePrompt, validatePlan } from './planner';
import { PALETTES, parsePalette } from './palettes';
import { parseProject } from './project';
const library = originalLibrary();
const xml = (s: string) => new DOMParser().parseFromString(s, 'image/svg+xml');
const topology = (el: Element): unknown => [el.localName, ...Array.from(el.children).map(topology)];
const transforms = (el: Element) =>
  [el, ...el.querySelectorAll('[transform]')]
    .filter((node) => node.hasAttribute('transform'))
    .map((node) => node.getAttribute('transform'));
const geometry = (s: string) =>
  [...xml(s).querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon')].map((el) => ({
    tag: el.localName,
    attrs: [...el.attributes]
      .filter((a) =>
        [
          'd',
          'x',
          'y',
          'width',
          'height',
          'rx',
          'ry',
          'cx',
          'cy',
          'r',
          'x1',
          'x2',
          'y1',
          'y2',
          'points',
          'transform',
          'stroke-width',
          'fill-rule',
          'clip-rule',
        ].includes(a.name),
      )
      .map((a) => [a.name, a.value]),
  }));
describe('исходная библиотека', () => {
  it('содержит 10 главных и 10 фоновых объектов каждого размера', () => {
    for (const detail of ['L', 'S'])
      for (const role of ['main', 'background'])
        expect(library.filter((a) => a.detail === detail && a.role === role)).toHaveLength(10);
    for (const a of library)
      expect(xml(a.source).querySelector('image,script,foreignObject')).toBeNull();
  });
  it.each(library.map((a) => [a.id, a] as const))(
    '%s: геометрия и source сохраняются при перекраске и экспорте',
    (_, a) => {
      const source = a.source;
      const p = {
        ...emptyProject(),
        assets: [a],
        items: a.role === 'backdrop' ? [] : [createItem(a)],
        backdropId: a.role === 'backdrop' ? a.id : null,
        palette: PALETTES[1],
      };
      expect(geometry(exportSvg(p))).toEqual(geometry(source));
      expect(a.source).toBe(source);
      const svg = xml(exportSvg(p));
      expect(svg.querySelector('parsererror,image')).toBeNull();
      expect(svg.querySelector(`[data-source-id="${a.id}"]`)).not.toBeNull();
      const embedded = svg.querySelector(`[data-source-id="${a.id}"] > g > svg`)!;
      expect(topology(embedded)).toEqual(topology(xml(source).documentElement));
      expect(transforms(embedded)).toEqual(transforms(xml(source).documentElement));
    },
  );
  it('перекрашивает только в разрешённые цвета выбранной схемы', () => {
    for (const a of library)
      for (const p of PALETTES) {
        const out = xml(assetMarkup(a, 'test', p));
        const allowed = [
          ...(a.role === 'main' ? p.objects : []),
          ...p.background,
          ...p.neutral,
        ].map((c) => c.toLowerCase());
        for (const el of out.querySelectorAll('*'))
          for (const name of ['fill', 'stroke', 'stop-color', 'color']) {
            const v = el.getAttribute(name);
            if (v && !['none', 'transparent'].includes(v) && !v.startsWith('url('))
              expect(allowed, `${a.id} ${p.name}: ${v}`).toContain(v.toLowerCase());
          }
      }
  });
});
describe('детерминированный планировщик', () => {
  const selected = library.filter(
    (a) =>
      a.detail === 'L' &&
      ['book', 'phone', 'lamp', 'headphones', 'puzzle'].includes(a.family) &&
      a.role === 'main',
  );
  it.each(
    (Object.keys(FORMATS) as Format[]).flatMap((f) =>
      (['balanced', 'offset', 'headline'] as Template[]).map((t) => [f, t] as const),
    ),
  )('%s / %s: безопасные зоны, один масштаб и только исходные компоненты', (format, template) => {
    const p = adaptFormat({ ...emptyProject(), assets: library }, format);
    const r = assemble(p, selected, template);
    const again = assemble(p, selected, template);
    expect(outsideSafe(r.project)).toEqual([]);
    expect(r.project.scale).toBe(again.project.scale);
    expect(r.project.items.map(({ id, ...i }) => i)).toEqual(
      again.project.items.map(({ id, ...i }) => i),
    );
    for (const i of r.project.items) {
      expect(selected.some((a) => a.id === i.assetId)).toBe(true);
      expect('scale' in i).toBe(false);
    }
  });
  it('при смене формата использует один коэффициент для всех позиций и размеров', () => {
    const p = assemble({ ...emptyProject(), assets: library }, selected, 'offset').project;
    const q = adaptFormat(p, 'portrait');
    const k = q.scale / p.scale;
    p.items.forEach((i, n) => {
      expect(q.items[n].x - q.width / 2).toBeCloseTo((i.x - p.width / 2) * k);
      expect(q.items[n].y - q.height / 2).toBeCloseTo((i.y - p.height / 2) * k);
      expect(q.items[n].rotation).toBe(i.rotation);
    });
    const back = adaptFormat(q, 'landscape');
    expect(back.scale).toBeCloseTo(p.scale);
  });
  it('отклоняет неизвестный assetId от будущего удалённого планировщика', () => {
    expect(() =>
      validatePlan(
        {
          scale: 1,
          placements: [{ assetId: 'invented', x: 200, y: 200, rotation: 0 }],
          explanation: [],
        },
        { assets: selected, width: 1200, height: 630, safe: 40, template: 'balanced' },
      ),
    ).toThrow();
  });
  it('текст не создаёт неизвестную графику и объясняет нераспознанные слова', () => {
    const r = parsePrompt('телефон и дракон под заголовок', selected);
    expect(r.matches.map((a) => a.family)).toEqual(['phone']);
    expect(r.template).toBe('headline');
    expect(r.explanation.join(' ')).toContain('дракон');
    expect(parsePrompt('дракон', selected).matches).toEqual([]);
  });
});
describe('переносимый JSON', () => {
  const p: Project = {
    ...emptyProject(),
    assets: library,
    items: library.filter((a) => a.role === 'main' && a.detail === 'L').map((a) => createItem(a)),
    palette: PALETTES[2],
    backdropId: 'original-backdrop-peach',
  };
  it('повторно открывает все source, координаты, порядок, фон и палитру', () => {
    expect(parseProject(JSON.stringify(p))).toEqual(p);
  });
  it('не доверяет сохранённым метаданным SVG', () => {
    const corrupt = JSON.parse(JSON.stringify(p));
    corrupt.assets[0].width = 7;
    expect(parseProject(JSON.stringify(corrupt)).assets[0].width).toBe(p.assets[0].width);
  });
  it('отклоняет отсутствующий исходник, NaN, повтор id и неверный формат', () => {
    for (const patch of [
      { items: [{ ...p.items[0], assetId: 'missing' }] },
      { scale: null },
      { format: '__proto__' },
      { assets: [p.assets[0], p.assets[0]] },
    ])
      expect(() => parseProject(JSON.stringify({ ...p, ...patch }))).toThrow();
  });
  it('проверяет структуру палитры и не принимает CSS вместо цвета', () => {
    expect(parsePalette(JSON.stringify(PALETTES[0]))).toEqual(PALETTES[0]);
    expect(() => parsePalette(JSON.stringify({ ...PALETTES[0], background: ['red'] }))).toThrow();
  });
});
describe('SVG: ссылки, стили и небезопасный импорт', () => {
  const sample =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 100 80"><defs><linearGradient id="paint"><stop stop-color="#F9A3AA"/></linearGradient><clipPath id="clip"><path d="M10 20H110V100H10Z"/></clipPath></defs><style>.body{fill:url(#paint);stroke:#181817}</style><g clip-path="url(#clip)"><path class="body" d="M10 20H110V100H10Z"/></g></svg>';
  it('изолирует ID и CSS при повторном использовании градиента и clipPath', () => {
    const a = importSvg(sample, 'gradient');
    const output = exportSvg({
      ...emptyProject(),
      assets: [a],
      items: [createItem(a), createItem(a)],
      palette: PALETTES[1],
    });
    const doc = xml(output);
    const ids = [...doc.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const match of output.matchAll(/url\(#([^)]+)\)/g)) expect(ids).toContain(match[1]);
    expect(doc.querySelector('style')!.textContent).toContain('#scope-export-');
    expect(geometry(output)).toEqual([...geometry(sample), ...geometry(sample)]);
  });
  it.each([
    '<image href="data:image/png;base64,xx"/>',
    '<script>alert(1)</script>',
    '<foreignObject/>',
    '<path onload="alert(1)"/>',
    '<use href="https://example.com/x.svg"/>',
    '<path fill="url(https://example.com/x)"/>',
    '<style>@import "https://example.com";</style>',
    '<style>.x{position:fixed}</style>',
  ])('отклоняет %s', (unsafe) => {
    expect(() =>
      importSvg(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${unsafe}</svg>`,
        'unsafe',
      ),
    ).toThrow();
  });
  it('не подменяет PNG на SVG', () => {
    expect(() => importSvg('data:image/png;base64,abc', 'fake.svg')).toThrow();
  });
});
