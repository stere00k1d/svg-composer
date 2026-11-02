export type Role = 'main' | 'background' | 'backdrop';
export type Format = 'square' | 'landscape' | 'portrait';
export type Template = 'balanced' | 'offset' | 'headline';
export type Detail = 'L' | 'S';
export interface Asset {
  id: string;
  name: string;
  source: string;
  viewBox: string;
  width: number;
  height: number;
  tags: string[];
  role: Role;
  family: string;
  detail: Detail;
}
export interface Item {
  id: string;
  assetId: string;
  x: number;
  y: number;
  rotation: number;
}
export interface Palette {
  name: string;
  background: [string, string, string];
  objects: [string, string, string];
  neutral: [string, string];
}
export interface Project {
  version: 1;
  name: string;
  format: Format;
  width: number;
  height: number;
  layoutWidth: number;
  layoutHeight: number;
  safe: number;
  scale: number;
  detail: Detail;
  assets: Asset[];
  items: Item[];
  backdropId: string | null;
  palette: Palette | null;
  template: Template;
}
export const FORMATS: Record<Format, { width: number; height: number; label: string }> = {
  square: { width: 1000, height: 1000, label: 'Квадрат' },
  landscape: { width: 1200, height: 630, label: 'Горизонтальный' },
  portrait: { width: 630, height: 1200, label: 'Вертикальный' },
};
export const TEMPLATES: Record<Template, string> = {
  balanced: 'Собранно',
  offset: 'Со смещением',
  headline: 'Под заголовок',
};
export const uid = () => crypto.randomUUID();
export const emptyProject = (): Project => ({
  version: 1,
  name: 'Новая композиция',
  format: 'landscape',
  width: 1200,
  height: 630,
  layoutWidth: 1120,
  layoutHeight: 550,
  safe: 40,
  scale: 0.35,
  detail: 'L',
  assets: [],
  items: [],
  backdropId: null,
  palette: null,
  template: 'balanced',
});
export function createItem(asset: Asset, x = 600, y = 315): Item {
  return { id: uid(), assetId: asset.id, x, y, rotation: 0 };
}
export const transform = (i: Item, scale: number) =>
  `translate(${i.x} ${i.y}) rotate(${i.rotation}) scale(${scale})`;
export function adaptFormat(p: Project, format: Format): Project {
  const { width, height } = FORMATS[format];
  const previousFit = Math.min(
    (p.width - 2 * p.safe) / p.layoutWidth,
    (p.height - 2 * p.safe) / p.layoutHeight,
  );
  const nextFit = Math.min(
    (width - 2 * p.safe) / p.layoutWidth,
    (height - 2 * p.safe) / p.layoutHeight,
  );
  const k = nextFit / previousFit;
  return {
    ...p,
    format,
    width,
    height,
    scale: p.scale * k,
    items: p.items.map((i) => ({
      ...i,
      x: width / 2 + (i.x - p.width / 2) * k,
      y: height / 2 + (i.y - p.height / 2) * k,
    })),
  };
}
export function bounds(a: Asset, i: Item, scale: number) {
  const r = (i.rotation * Math.PI) / 180;
  const w = ((Math.abs(a.width * Math.cos(r)) + Math.abs(a.height * Math.sin(r))) * scale) / 2;
  const h = ((Math.abs(a.width * Math.sin(r)) + Math.abs(a.height * Math.cos(r))) * scale) / 2;
  return { left: i.x - w, right: i.x + w, top: i.y - h, bottom: i.y + h };
}
export function outsideSafe(p: Project) {
  return p.items.flatMap((i) => {
    const a = p.assets.find((a) => a.id === i.assetId)!;
    const b = bounds(a, i, p.scale);
    return a.role === 'main' &&
      (b.left < p.safe - 0.001 ||
        b.right > p.width - p.safe + 0.001 ||
        b.top < p.safe - 0.001 ||
        b.bottom > p.height - p.safe + 0.001)
      ? [a.name]
      : [];
  });
}
