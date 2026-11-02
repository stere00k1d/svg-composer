import type { Palette } from './model';
// Exact swatch colors supplied by the user, in semantic order (not inferred from PNG).
export const PALETTES: Palette[] = [
  {
    name: 'Лаванда',
    background: ['#D7CDF5', '#AA9BF0', '#7864D7'],
    objects: ['#F9ECB0', '#F9A3AA', '#FFE3E1'],
    neutral: ['#181817', '#FFFFFF'],
  },
  {
    name: 'Персик',
    background: ['#FDD7B9', '#FAC896', '#D27532'],
    objects: ['#F9ECB0', '#80DADA', '#BEEBEB'],
    neutral: ['#181817', '#FFFFFF'],
  },
  {
    name: 'Бирюза',
    background: ['#BEEBEB', '#80DADA', '#5ABEBE'],
    objects: ['#FFD4F2', '#6D7BFC', '#B6C6FE'],
    neutral: ['#181817', '#FFFFFF'],
  },
];
export function parsePalette(text: string): Palette {
  const p = JSON.parse(text);
  const valid = (v: unknown, n: number) =>
    Array.isArray(v) &&
    v.length === n &&
    v.every((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c));
  if (
    !p ||
    typeof p.name !== 'string' ||
    !valid(p.background, 3) ||
    !valid(p.objects, 3) ||
    !valid(p.neutral, 2)
  )
    throw new Error(
      'Палитра: name, background (3 цвета), objects (3), neutral (2). Цвета в формате #RRGGBB.',
    );
  return {
    name: p.name.slice(0, 80),
    background: p.background,
    objects: p.objects,
    neutral: p.neutral,
  };
}
export function paintMapper(palette: Palette, sourceColors: string[], role: string) {
  const normalize = (v: string) =>
    v.toLowerCase() === 'white'
      ? '#ffffff'
      : v.toLowerCase() === 'black'
        ? '#181817'
        : v.toLowerCase();
  const normalized = sourceColors.map(normalize);
  const source = [...PALETTES].sort(
    (a, b) =>
      [...b.background, ...b.objects].filter((c) => normalized.includes(normalize(c))).length -
      [...a.background, ...a.objects].filter((c) => normalized.includes(normalize(c))).length,
  )[0];
  const from = [...source.background, ...source.objects, ...source.neutral].map(normalize);
  const to = [...palette.background, ...palette.objects, ...palette.neutral];
  const allowed =
    role === 'main'
      ? [...palette.objects, ...palette.background, ...palette.neutral]
      : [...palette.background, ...palette.neutral];
  const unknown = [...new Set(sourceColors.map(normalize).filter((c) => !from.includes(c)))].sort();
  return (value: string) => {
    if (/^(none|transparent|inherit|initial|unset)$/i.test(value)) return value;
    if (value.toLowerCase() === 'currentcolor') return palette.neutral[0];
    const key = normalize(value);
    const index = from.indexOf(key);
    if (index >= 0) {
      const target = to[index];
      return allowed.includes(target) ? target : palette.background[index % 3];
    }
    return allowed[Math.max(0, unknown.indexOf(key)) % allowed.length];
  };
}
