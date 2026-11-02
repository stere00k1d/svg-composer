import type { Asset, Item, Project, Template } from './model';
import { uid, bounds } from './model';
export interface PlanRequest {
  assets: Asset[];
  width: number;
  height: number;
  safe: number;
  template: Template;
}
export interface CompositionPlan {
  placements: Omit<Item, 'id'>[];
  scale: number;
  explanation: string[];
}
export interface CompositionPlanner {
  plan(request: PlanRequest): CompositionPlan;
}
// Pure deterministic implementation. A future AI adapter returns the same restricted plan.
export const localPlanner: CompositionPlanner = {
  plan({ assets, width, height, safe, template }) {
    if (!assets.length) throw new Error('Выберите компоненты для сборки');
    if (assets.length > 24) throw new Error('Автосборка поддерживает до 24 компонентов');
    const ordered = [
      ...assets.filter((a) => a.role === 'background'),
      ...assets.filter((a) => a.role === 'main'),
    ];
    const x0 = template === 'headline' ? width * 0.42 + safe : safe;
    const rw = width - safe - x0;
    const rh = height - 2 * safe;
    const rotations = ordered.map((_, n) => (template === 'offset' ? (n % 2 ? 8 : -8) : 0));
    const fit = (cols: number) => {
      const cw = rw / cols;
      const ch = rh / Math.ceil(ordered.length / cols);
      return Math.min(
        ...ordered.map((a, n) => {
          const r = (rotations[n] * Math.PI) / 180;
          return Math.min(
            (cw * 0.85) / (Math.abs(a.width * Math.cos(r)) + Math.abs(a.height * Math.sin(r))),
            (ch * 0.85) / (Math.abs(a.width * Math.sin(r)) + Math.abs(a.height * Math.cos(r))),
          );
        }),
      );
    };
    // Try each grid width and keep the largest common scale, with stable tie-breaking.
    let cols = 1;
    let scale = fit(cols);
    for (let candidate = 2; candidate <= ordered.length; candidate++) {
      const candidateScale = fit(candidate);
      if (candidateScale > scale) {
        cols = candidate;
        scale = candidateScale;
      }
    }
    const rows = Math.ceil(ordered.length / cols);
    const cw = rw / cols;
    const ch = rh / rows;
    return {
      scale,
      placements: ordered.map((a, n) => ({
        assetId: a.id,
        x:
          x0 +
          (rw - Math.min(cols, ordered.length - Math.floor(n / cols) * cols) * cw) / 2 +
          ((n % cols) + 0.5) * cw,
        y:
          safe +
          (Math.floor(n / cols) + 0.5) * ch +
          (template === 'offset' ? (n % 2 ? 0.025 : -0.025) * ch : 0),
        rotation: rotations[n],
      })),
      explanation: [
        `Использовано ${ordered.length} существующих компонентов. Новые объекты не создаются.`,
        `Единый масштаб ${scale.toFixed(4)}, безопасная зона ${safe}px.`,
        template === 'headline'
          ? 'Левые 42% холста свободны. Заголовок в графику не добавляется.'
          : 'Размеры объектов сохранены относительно исходных SVG.',
      ],
    };
  },
};
export function validatePlan(plan: CompositionPlan, request: PlanRequest) {
  if (
    !Number.isFinite(plan.scale) ||
    plan.scale <= 0 ||
    plan.scale > 1000 ||
    plan.placements.length > 100
  )
    throw new Error('Некорректный план');
  for (const i of plan.placements) {
    const a = request.assets.find((a) => a.id === i.assetId);
    if (!a || a.role === 'backdrop' || ![i.x, i.y, i.rotation].every(Number.isFinite))
      throw new Error('План содержит отсутствующий компонент или некорректные координаты');
    const b = bounds(a, { ...i, id: '' }, plan.scale);
    if (
      a.role === 'main' &&
      (b.left < request.safe ||
        b.top < request.safe ||
        b.right > request.width - request.safe ||
        b.bottom > request.height - request.safe)
    )
      throw new Error('Главный объект вышел за безопасную зону');
  }
}
export function assemble(p: Project, assets: Asset[], template: Template) {
  const request = {
    assets: assets.filter((a) => a.role !== 'backdrop'),
    width: p.width,
    height: p.height,
    safe: p.safe,
    template,
  };
  const plan = localPlanner.plan(request);
  validatePlan(plan, request);
  return {
    project: {
      ...p,
      template,
      layoutWidth: p.width - 2 * p.safe,
      layoutHeight: p.height - 2 * p.safe,
      scale: plan.scale,
      items: plan.placements.map((i) => ({ ...i, id: uid() })),
    },
    explanation: plan.explanation,
  };
}
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export function parsePrompt(text: string, assets: Asset[]) {
  const words = normalize(text).split(' ').filter(Boolean);
  const matches = assets.filter(
    (a) =>
      a.role !== 'backdrop' &&
      [a.name, ...a.tags].some((t) => {
        const ts = normalize(t).split(' ').filter(Boolean);
        return ts.length && ts.every((w) => words.includes(w));
      }),
  );
  const known = new Set(
    matches.flatMap((a) => [a.name, ...a.tags].flatMap((t) => normalize(t).split(' '))),
  );
  const commands = new Set([
    'собери',
    'композицию',
    'композиция',
    'из',
    'и',
    'с',
    'на',
    'фон',
    'для',
    'под',
    'заголовок',
    'собранно',
    'смещением',
  ]);
  const unmatched = [...new Set(words.filter((w) => !known.has(w) && !commands.has(w)))];
  const template: Template = words.includes('заголовок')
    ? 'headline'
    : words.includes('смещением')
      ? 'offset'
      : 'balanced';
  return {
    matches,
    template,
    explanation: [
      `Локальный поиск по точным словам имён и тегов. Найдено: ${matches.map((a) => a.name).join(', ') || 'ничего'}.`,
      ...(unmatched.length ? [`Не распознано и не добавлено: ${unmatched.join(', ')}.`] : []),
    ],
  };
}
