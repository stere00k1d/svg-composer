import type { Asset, Template } from './model';
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const nouns: Record<string, RegExp> = {
  book: /^(книг\p{L}*|учебник\p{L}*|book)$/u,
  phone: /^(телефон\p{L}*|смартфон\p{L}*|phone)$/u,
  puzzle: /^(пазл\p{L}*|головоломк\p{L}*|puzzle)$/u,
  coin: /^(монет\p{L}*|coin)$/u,
  headphones: /^(наушник\p{L}*|headphones)$/u,
  lamp: /^(ламп\p{L}*|светильник\p{L}*|lamp)$/u,
  flowers: /^(цветы|цветок|цветами|цветов|букет\p{L}*|flowers)$/u,
  wallet: /^(кошел\p{L}*|портмоне|wallet)$/u,
  folder: /^(папк\p{L}*|folder)$/u,
  pen: /^(ручк\p{L}*|pen)$/u,
};
interface Topic {
  name: string;
  phrases: string[];
  stems: string[];
  objects: [string, 'main' | 'background'][];
  focus: string;
  reason: string;
}
const topics: Topic[] = [
  {
    name: 'Учёба и новые знания',
    phrases: ['знание сила', 'знания сила', 'новая глава', 'учиться новому', 'с чистого листа'],
    stems: ['учеб', 'образован', 'экзамен', 'знани', 'навык', 'обучен', 'курс'],
    objects: [
      ['book', 'main'],
      ['phone', 'main'],
      ['lamp', 'main'],
      ['pen', 'main'],
    ],
    focus: 'book',
    reason: 'Книга — основа знаний; телефон, лампа и ручка поддерживают сценарий рабочего места.',
  },
  {
    name: 'Музыка и ритм',
    phrases: ['поймать ритм', 'на своей волне', 'пауза для себя', 'услышать главное'],
    stems: ['музык', 'ритм', 'слуш', 'аудио', 'подкаст', 'мелоди', 'звук'],
    objects: [
      ['headphones', 'main'],
      ['phone', 'main'],
      ['flowers', 'background'],
    ],
    focus: 'headphones',
    reason:
      'Наушники передают тему звука; телефон — источник музыки, фоновые цветы поддерживают спокойное настроение.',
  },
  {
    name: 'Финансы и накопления',
    phrases: [
      'финансовая подушка',
      'деньги под контролем',
      'копейка рубль бережет',
      'умные накопления',
    ],
    stems: ['финанс', 'накоп', 'бюджет', 'сбереж', 'деньг', 'доход', 'оплат', 'инвест'],
    objects: [
      ['wallet', 'main'],
      ['coin', 'main'],
      ['phone', 'background'],
    ],
    focus: 'wallet',
    reason:
      'Кошелёк и монета обозначают бюджет; фоновый телефон — цифровые финансы. Подушка не рисуется.',
  },
  {
    name: 'Идеи и решения',
    phrases: [
      'собрать картину',
      'все сложилось',
      'найти решение',
      'светлая мысль',
      'яркие идеи',
      'искать выход',
    ],
    stems: ['иде', 'решени', 'творче', 'вдохнов', 'задач', 'изобрет'],
    objects: [
      ['lamp', 'main'],
      ['puzzle', 'main'],
      ['pen', 'main'],
    ],
    focus: 'lamp',
    reason: 'Лампа — условный знак идеи, пазлы — поиска решения, ручка — воплощения.',
  },
  {
    name: 'Порядок в работе',
    phrases: ['все на своих местах', 'разложить по полочкам', 'порядок в делах', 'делу время'],
    stems: ['работ', 'поряд', 'организ', 'документ', 'планир', 'продуктив', 'офис'],
    objects: [
      ['folder', 'main'],
      ['pen', 'main'],
      ['phone', 'background'],
      ['coin', 'main'],
    ],
    focus: 'folder',
    reason:
      'Папка собирает документы в смысловой центр; ручка, телефон и монета обозначают рабочие задачи.',
  },
  {
    name: 'Забота и внимание',
    phrases: ['знаки внимания', 'теплые чувства', 'маленькие радости', 'время для себя'],
    stems: ['забот', 'вниман', 'подар', 'праздн', 'весн', 'радост', 'отдых'],
    objects: [
      ['flowers', 'main'],
      ['wallet', 'main'],
      ['headphones', 'background'],
    ],
    focus: 'flowers',
    reason:
      'Цветы — главный знак внимания; остальные существующие предметы поддерживают тему личного времени.',
  },
];
const stop = new Set(
  'собери композицию композиция из и с со на фон фоне для под заголовок собранно смещением фоновый фоновые фоновая фоном главный главные сделай про о в во а по к как без это мне мы наш новый новая новые всего все своих своих места рабочий'.split(
    ' ',
  ),
);
export const PROMPT_EXAMPLES = [
  'Знания — сила',
  'Поймать ритм',
  'Финансовая подушка',
  'Яркие идеи',
];
export function parsePrompt(text: string, assets: Asset[]) {
  const normalized = normalize(text);
  const words = normalized.split(' ').filter(Boolean);
  const used = new Set<string>();
  const available = assets.filter((a) => a.role !== 'backdrop');
  const families = [...new Set(available.map((a) => a.family))];
  const excluded = families.filter((family) =>
    words.some(
      (word, index) =>
        nouns[family]?.test(word) &&
        words.slice(Math.max(0, index - 2), index).some((w) => ['без', 'кроме', 'не'].includes(w)),
    ),
  );
  const literal = families.filter((family) => {
    const a = available.find((a) => a.family === family)!;
    const rx = nouns[family];
    let matched = false;
    for (const w of words)
      if (rx?.test(w) || (!rx && [a.name, ...a.tags].some((n) => normalize(n) === w))) {
        used.add(w);
        matched = true;
      }
    return matched && !excluded.includes(family);
  });
  const ranked = topics
    .map((topic, index) => ({
      topic,
      index,
      score:
        topic.phrases.reduce((score, p) => score + (normalized.includes(p) ? 12 : 0), 0) +
        words.reduce((score, w) => score + (topic.stems.some((s) => w.startsWith(s)) ? 3 : 0), 0),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const topic = ranked[0]?.topic;
  let matches: Asset[] = [];
  let focusId: string | undefined;
  const reasons: string[] = [];
  if (literal.length) {
    for (const family of literal) {
      const nounIndex = words.findIndex((w) => nouns[family]?.test(w));
      const prefix = words.slice(Math.max(0, nounIndex - 3), nounIndex);
      const localPrefix = prefix.slice(prefix.lastIndexOf('и') + 1);
      const requestedBackground =
        localPrefix.some((w) => /^фонов/.test(w)) ||
        words[nounIndex - 1] === 'фоне' ||
        words[nounIndex + 1] === 'фоном';
      const a =
        available.find(
          (a) => a.family === family && a.role === (requestedBackground ? 'background' : 'main'),
        ) ?? available.find((a) => a.family === family);
      if (a) matches.push(a);
    }
    reasons.push(
      'Найдены названия предметов и их словоформы. Выбраны только эти существующие компоненты.',
    );
  } else if (topic) {
    for (const [family, role] of topic.objects) {
      const a =
        available.find((a) => a.family === family && a.role === role) ??
        available.find((a) => a.family === family);
      if (a) matches.push(a);
    }
    focusId = matches.find((a) => a.family === topic.focus)?.id;
    reasons.push(`Тема из локального словаря: «${topic.name}».`, topic.reason);
    for (const w of words)
      if (
        topic.stems.some((s) => w.startsWith(s)) ||
        topic.phrases.some((p) => p.split(' ').includes(w))
      )
        used.add(w);
  } else {
    for (const a of available) {
      if (
        a.tags.some((tag) => normalize(tag) && ` ${normalized} `.includes(` ${normalize(tag)} `))
      ) {
        if (!matches.some((m) => m.family === a.family)) {
          matches.push(a);
          for (const w of words) if (a.tags.some((t) => normalize(t).includes(w))) used.add(w);
        }
      }
    }
  }
  matches = matches.filter((a) => !excluded.includes(a.family));
  if (excluded.length)
    reasons.push(
      `Исключены по условию: ${excluded.map((f) => available.find((a) => a.family === f)?.name).join(', ')}.`,
    );
  const unmatched = [...new Set(words.filter((w) => !used.has(w) && !stop.has(w)))];
  const template: Template = words.includes('заголовок')
    ? 'headline'
    : words.includes('смещением')
      ? 'offset'
      : 'balanced';
  return {
    matches,
    focusId,
    template,
    topic: literal.length ? 'Названные предметы' : (topic?.name ?? null),
    explanation: [
      ...reasons,
      `Локальный словарь и правила; это не LLM. Найдено: ${matches.map((a) => a.name).join(', ') || 'ничего'}.`,
      ...(unmatched.length ? [`Не распознано и не добавлено: ${unmatched.join(', ')}.`] : []),
    ],
  };
}
