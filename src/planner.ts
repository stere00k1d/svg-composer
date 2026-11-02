import { compose } from './composition';
import type { Asset, Item, Project, Template } from './model';
import { uid, bounds } from './model';
export interface PlanRequest {
  assets: Asset[];
  width: number;
  height: number;
  safe: number;
  template: Template;
  focusId?: string;
}
export interface CompositionPlan {
  placements: Omit<Item, 'id'>[];
  scale: number;
  explanation: string[];
  focusId?: string;
}
export interface CompositionPlanner {
  plan(request: PlanRequest): CompositionPlan;
}
// Pure deterministic implementation. A future AI adapter returns the same restricted plan.
export const localPlanner: CompositionPlanner = { plan: compose };
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
export function assemble(p: Project, assets: Asset[], template: Template, focusId?: string) {
  const request = {
    assets: assets.filter((a) => a.role !== 'backdrop'),
    width: p.width,
    height: p.height,
    safe: p.safe,
    template,
    focusId,
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
export { parsePrompt } from './semantics';
