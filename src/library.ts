import { importSvg } from './svg';
import { emptyProject } from './model';
import type { Asset, Project, Detail } from './model';
const objects = import.meta.glob('../assets/figma/svg/{L,S}/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const backdrops = import.meta.glob('../assets/figma/svg/{backdrops,S-backdrops}/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const names: Record<string, string> = {
  book: 'Книга',
  phone: 'Телефон',
  puzzle: 'Пазлы',
  coin: 'Монета',
  headphones: 'Наушники',
  lamp: 'Лампа',
  flowers: 'Цветы',
  wallet: 'Кошелек',
  folder: 'Папка',
  pen: 'Ручка',
};
const aliases: Record<string, string[]> = {
  book: ['book', 'книгу', 'учеба'],
  phone: ['phone', 'телефоном', 'связь'],
  puzzle: ['puzzle', 'пазл', 'задачи'],
  coin: ['coin', 'монету', 'деньги'],
  headphones: ['headphones', 'музыка'],
  lamp: ['lamp', 'лампу', 'свет'],
  flowers: ['flowers', 'цветами', 'букет'],
  wallet: ['wallet', 'кошельком', 'финансы'],
  folder: ['folder', 'папку', 'документы'],
  pen: ['pen', 'ручку', 'письмо'],
};
export function originalLibrary(): Asset[] {
  return [
    ...Object.entries(objects).map(([path, source]) => {
      const parts = path.split('/');
      const detail = parts[parts.length - 2] as 'L' | 'S';
      const file = parts.pop()!.replace('.svg', '');
      const [family, role] = file.split('-');
      return {
        ...importSvg(source, names[family]),
        id: `original-${detail}-${file}`,
        detail,
        family,
        role: role as 'main' | 'background',
        tags: aliases[family] ?? [],
      };
    }),
    ...Object.entries(backdrops).map(([path, source]) => {
      const family = path.split('/').pop()!.replace('.svg', '');
      const detail: Detail = path.includes('/S-backdrops/') ? 'S' : 'L';
      return {
        ...importSvg(
          source,
          `Фон · ${family === 'lavender' ? 'Лаванда' : family === 'peach' ? 'Персик' : 'Бирюза'}`,
        ),
        id: `original-backdrop-${detail === 'S' ? 'S-' : ''}${family}`,
        detail,
        family,
        role: 'backdrop' as const,
      };
    }),
  ];
}
export function newProject(): Project {
  return { ...emptyProject(), assets: originalLibrary() };
}
