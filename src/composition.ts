import type { Asset, Item } from './model';
import { bounds } from './model';
import type { CompositionPlan, PlanRequest } from './planner';

type Placement = Omit<Item, 'id'>;
type Box = ReturnType<typeof bounds>;
const area = (a: Asset) => a.width * a.height;
const boxArea = (b: Box) => (b.right - b.left) * (b.bottom - b.top);
export function intersection(a: Box, b: Box) {
  return (
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  );
}
const box = (a: Asset, p: Placement, scale = 1) => bounds(a, { ...p, id: '' }, scale);
export function isIntentionalStack(a: Asset, b: Asset) {
  return (
    [a.family, b.family].some((f) => ['book', 'folder'].includes(f)) &&
    [a.family, b.family].some((f) => ['phone', 'puzzle', 'pen'].includes(f))
  );
}
function overlapLimit(a: Asset, b: Asset) {
  if (a.role === 'background' || b.role === 'background') return 0.78;
  return isIntentionalStack(a, b) ? 0.88 : 0.13;
}
function union(boxes: Box[]): Box {
  return {
    left: Math.min(...boxes.map((b) => b.left)),
    right: Math.max(...boxes.map((b) => b.right)),
    top: Math.min(...boxes.map((b) => b.top)),
    bottom: Math.max(...boxes.map((b) => b.bottom)),
  };
}

// Native dimensions drive hierarchy. No object receives an individual scale.
const preferred: Record<string, [number, number]> = {
  phone: [-0.24, -0.37],
  lamp: [0.78, -0.35],
  headphones: [-0.6, -0.32],
  pen: [0.65, 0.53],
  puzzle: [0.03, -0.65],
  coin: [0.48, 0.5],
  flowers: [0.83, -0.15],
  wallet: [0.54, 0.5],
  folder: [-0.15, -0.6],
  book: [-0.65, 0.28],
};
const generic: [number, number][] = [
  [0.85, -0.32],
  [-0.72, -0.34],
  [0.7, 0.55],
  [-0.58, 0.56],
  [0.05, -0.88],
  [1.02, 0.15],
  [-0.95, 0.15],
  [0, 0.95],
];

export function compositionRegion({ width, height, safe, template }: PlanRequest) {
  if (template !== 'headline')
    return {
      x: safe,
      y: safe,
      width: width - safe * 2,
      height: height - safe * 2,
      reserved: 'Без свободного поля под текст',
    };
  if (width / height >= 1.35)
    return {
      x: width * 0.4 + safe,
      y: safe,
      width: width * 0.6 - safe * 2,
      height: height - safe * 2,
      reserved: 'Левые 40% оставлены для заголовка',
    };
  return {
    x: safe,
    y: height * 0.3 + safe,
    width: width - safe * 2,
    height: height * 0.7 - safe * 2,
    reserved: 'Верхние 30% оставлены для заголовка',
  };
}

export function compose(request: PlanRequest): CompositionPlan {
  const { assets, width, height, safe, template } = request;
  if (!assets.length) throw new Error('Выберите компоненты для сборки');
  if (assets.length > 24) throw new Error('Автосборка поддерживает до 24 компонентов');
  if (new Set(assets.map((a) => a.detail)).size !== 1)
    throw new Error('В одной компоновке используйте один набор детализации');
  const available = assets.filter((a) => a.role !== 'backdrop');
  if (!available.length) throw new Error('Выберите предметы, а не только фон холста');
  const main = available.filter((a) => a.role === 'main');
  const hero =
    available.find((a) => a.id === request.focusId) ??
    [...(main.length ? main : available)].sort(
      (a, b) => area(b) - area(a) || a.id.localeCompare(b.id),
    )[0];
  const region = compositionRegion(request);
  const portrait = region.width / region.height < 0.8;
  const raw = new Map<string, Placement>();
  raw.set(hero.id, {
    assetId: hero.id,
    x: 0,
    y: 0,
    rotation: template === 'offset' ? -5 : template === 'balanced' ? -2 : 0,
  });
  const supports = available
    .filter((a) => a.id !== hero.id)
    .sort((a, b) => {
      const stackPriority = (a: Asset) =>
        ['book', 'folder'].includes(hero.family) && a.family === 'phone' ? -1 : 0;
      // Large fixtures establish the perimeter; small pieces then occupy the gaps.
      return stackPriority(a) - stackPriority(b) || area(b) - area(a) || a.id.localeCompare(b.id);
    });
  const spreadAngle = template === 'offset' ? (-24 * Math.PI) / 180 : 0;
  supports.forEach((a, index) => {
    let [dx, dy] = preferred[a.family] ?? generic[index % generic.length];
    if (hero.family !== 'book' && hero.family !== 'folder') {
      [dx, dy] = generic[index % generic.length];
      if (a.family === 'phone') {
        dx = -0.45;
        dy = -0.68;
      }
      if (a.family === 'coin') {
        dx = 0.5;
        dy = 0.48;
      }
      if (a.family === 'pen') {
        dx = 0.62;
        dy = 0.55;
      }
    }
    if (portrait) {
      dx *= 0.62;
      dy *= 1.2;
      if (index > 1) dy += Math.floor(index / 3) * 0.6;
    }
    const x = dx * hero.width;
    const y = dy * hero.height;
    const target = {
      x: x * Math.cos(spreadAngle) - y * Math.sin(spreadAngle),
      y: x * Math.sin(spreadAngle) + y * Math.cos(spreadAngle),
    };
    const rotation = template === 'offset' ? (index % 2 ? 5 : -3) : a.family === 'pen' ? -4 : 0;
    const candidates: Placement[] = [];
    for (const stretch of [1, 1.12, 1.28, 1.48, 1.75, 2.1, 2.6, 3.2, 4, 5])
      for (const turn of [0, 0.18, -0.18, 0.36, -0.36]) {
        candidates.push({
          assetId: a.id,
          x: (target.x * Math.cos(turn) - target.y * Math.sin(turn)) * stretch,
          y: (target.x * Math.sin(turn) + target.y * Math.cos(turn)) * stretch,
          rotation,
        });
      }
    const valid = (p: Placement) =>
      [...raw.values()].every((other) => {
        const oa = available.find((v) => v.id === other.assetId)!;
        const ba = box(a, p);
        const bb = box(oa, other);
        const overlap = intersection(ba, bb) / Math.min(boxArea(ba), boxArea(bb));
        return overlap <= overlapLimit(a, oa);
      });
    // Deterministic geometric fallback, independent of randomness or viewport pixels.
    let choice = candidates.find(valid);
    if (!choice) {
      const extent = union(
        [...raw.values()].map((p) =>
          box(
            available.find((a) => a.id === p.assetId)!,
            p,
          ),
        ),
      );
      choice = {
        assetId: a.id,
        x: extent.right + a.width * 0.55 + hero.width * 0.04,
        y: (extent.top + extent.bottom) / 2,
        rotation,
      };
    }
    raw.set(a.id, choice);
  });
  const fitting = (template === 'headline' ? available : main.length ? main : available).map((a) =>
    box(a, raw.get(a.id)!),
  );
  const extent = union(fitting);
  let scale =
    Math.min(
      region.width / (extent.right - extent.left),
      region.height / (extent.bottom - extent.top),
    ) * 0.94;
  for (const background of available.filter((a) => a.role === 'background')) {
    const b = box(background, raw.get(background.id)!);
    scale = Math.min(
      scale,
      width / ((b.right - b.left) * 0.65),
      height / ((b.bottom - b.top) * 0.65),
    );
  }
  const cx = (extent.left + extent.right) / 2;
  const cy = (extent.top + extent.bottom) / 2;
  const placements = available.map((a) => {
    const p = raw.get(a.id)!;
    return {
      ...p,
      x: region.x + region.width / 2 + (p.x - cx) * scale,
      y: region.y + region.height / 2 + (p.y - cy) * scale,
    };
  });
  let cropped = 0;
  for (const a of available.filter((a) => a.role === 'background')) {
    const p = placements.find((p) => p.assetId === a.id)!;
    const b = box(a, p, scale);
    const hw = (b.right - b.left) / 2;
    const hh = (b.bottom - b.top) / 2;
    // Background objects may crop, but at least 65% of each bounding dimension remains on canvas.
    p.x = Math.max(hw * 0.3, Math.min(width - hw * 0.3, p.x));
    p.y = Math.max(hh * 0.3, Math.min(height - hh * 0.3, p.y));
    const clipped = box(a, p, scale);
    if (clipped.left < 0 || clipped.top < 0 || clipped.right > width || clipped.bottom > height)
      cropped++;
  }
  const z = (a: Asset) =>
    a.role === 'background'
      ? 0
      : a.id === hero.id
        ? 2
        : ['phone', 'puzzle', 'coin', 'pen', 'wallet'].includes(a.family)
          ? 3
          : 1;
  placements.sort(
    (a, b) =>
      z(available.find((v) => v.id === a.assetId)!) -
        z(available.find((v) => v.id === b.assetId)!) || a.assetId.localeCompare(b.assetId),
  );
  return {
    placements,
    scale,
    focusId: hero.id,
    explanation: [
      `Фокус — ${hero.name}. ${available.length} исходных объектов; общий масштаб ${scale.toFixed(4)}.`,
      template === 'balanced'
        ? 'Устойчивая группа: крупные предметы задают опору, небольшие связывают её части.'
        : template === 'offset'
          ? 'Диагональное движение: позиции и небольшие повороты создают направленный ритм.'
          : `${region.reserved}. Текст и новая графика не добавляются.`,
      `Пересечения проверены по повёрнутым границам. Для книги/папки и мелких предметов допускается осмысленное наложение. Поле ${safe}px.`,
      cropped
        ? `Фоновых объектов с контролируемой обрезкой: ${cropped}.`
        : 'Главные объекты помещены внутри безопасной зоны.',
    ],
  };
}
