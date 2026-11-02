import type { Project } from './model';
import { FORMATS } from './model';
import { importSvg } from './svg';
import { parsePalette } from './palettes';
export function parseProject(text: string): Project {
  if (text.length > 25_000_000) throw new Error('Проект превышает 25 МБ');
  const p = JSON.parse(text);
  if (
    !p ||
    p.version !== 1 ||
    typeof p.name !== 'string' ||
    !Object.hasOwn(FORMATS, p.format) ||
    !Array.isArray(p.assets) ||
    !Array.isArray(p.items) ||
    p.assets.length > 100 ||
    p.items.length > 300
  )
    throw new Error('Неподдерживаемый или повреждённый проект');
  const size = FORMATS[p.format as keyof typeof FORMATS];
  if (
    p.width !== size.width ||
    p.height !== size.height ||
    ![p.layoutWidth, p.layoutHeight].every(
      (n) => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 1200,
    ) ||
    !Number.isFinite(p.safe) ||
    p.safe < 0 ||
    p.safe > 120 ||
    !Number.isFinite(p.scale) ||
    p.scale <= 0 ||
    p.scale > 1000 ||
    !['L', 'S'].includes(p.detail) ||
    !['balanced', 'offset', 'headline'].includes(p.template)
  )
    throw new Error('Некорректные параметры холста');
  const idValid = (id: unknown): id is string =>
    typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
  const ids = new Set<string>();
  const assets = p.assets.map((a: Record<string, unknown>) => {
    if (
      !a ||
      !idValid(a.id) ||
      ids.has(a.id) ||
      typeof a.source !== 'string' ||
      typeof a.name !== 'string' ||
      typeof a.family !== 'string' ||
      !['main', 'background', 'backdrop'].includes(String(a.role)) ||
      !['L', 'S'].includes(String(a.detail)) ||
      !Array.isArray(a.tags) ||
      a.tags.some((t) => typeof t !== 'string')
    )
      throw new Error('Некорректная библиотека');
    ids.add(a.id);
    return {
      ...importSvg(a.source, a.name),
      id: a.id,
      name: a.name,
      family: a.family,
      role: a.role as 'main' | 'background' | 'backdrop',
      detail: a.detail as 'L' | 'S',
      tags: a.tags as string[],
    };
  });
  const itemIds = new Set<string>();
  const items = p.items.map((i: Record<string, unknown>) => {
    if (
      !i ||
      !idValid(i.id) ||
      itemIds.has(i.id) ||
      !ids.has(String(i.assetId)) ||
      assets.find((a: { id: string; role: string }) => a.id === i.assetId)?.role === 'backdrop' ||
      assets.find((a: { id: string; detail: string }) => a.id === i.assetId)?.detail !== p.detail ||
      ![i.x, i.y, i.rotation].every(
        (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e7,
      )
    )
      throw new Error('Некорректный экземпляр или отсутствующий исходник');
    itemIds.add(i.id);
    return {
      id: i.id,
      assetId: i.assetId as string,
      x: i.x as number,
      y: i.y as number,
      rotation: i.rotation as number,
    };
  });
  if (
    p.backdropId !== null &&
    (!idValid(p.backdropId) ||
      !assets.some(
        (a: { id: string; role: string }) => a.id === p.backdropId && a.role === 'backdrop',
      ))
  )
    throw new Error('Некорректный фон');
  return {
    version: 1,
    name: p.name.slice(0, 200),
    format: p.format,
    width: size.width,
    height: size.height,
    layoutWidth: p.layoutWidth,
    layoutHeight: p.layoutHeight,
    safe: p.safe,
    scale: p.scale,
    detail: p.detail,
    template: p.template,
    assets,
    items,
    backdropId: p.backdropId,
    palette: p.palette === null ? null : parsePalette(JSON.stringify(p.palette)),
  };
}
