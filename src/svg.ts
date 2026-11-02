import * as css from 'css-tree';
import type { Asset, Project, Palette } from './model';
import { uid, transform } from './model';
import { paintMapper } from './palettes';
const NS = 'http://www.w3.org/2000/svg';
const TAGS = new Set(
  'svg g defs symbol use path rect circle ellipse line polyline polygon text tspan textPath title desc metadata linearGradient radialGradient stop clipPath mask pattern marker filter feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence style'.split(
    ' ',
  ),
);
const PROPS = new Set(
  'fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity color stop-color stop-opacity flood-color flood-opacity lighting-color clip-path clip-rule mask filter marker-start marker-mid marker-end display visibility font-family font-size font-style font-weight text-anchor dominant-baseline paint-order vector-effect shape-rendering text-rendering color-interpolation color-interpolation-filters transform transform-origin transform-box'.split(
    ' ',
  ),
);
const PAINT = new Set(['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color']);
const literal = (v: string) =>
  !!v && !/^(none|transparent|inherit|initial|unset|currentcolor)$/i.test(v) && !/^url\(/i.test(v);
function remapPaint(value: string, paint: (v: string) => string) {
  if (/^url\(/i.test(value)) {
    return value.replace(
      /^(url\([^)]*\))\s+(.+)$/i,
      (_, url, fallback) => `${url} ${paint(fallback)}`,
    );
  }
  return paint(value);
}
function parseCss(text: string, context: 'stylesheet' | 'declarationList' | 'value') {
  const ast = css.parse(text, {
    context,
    onParseError: () => {
      throw new Error('Неподдерживаемый CSS');
    },
  });
  css.walk(ast, (n) => {
    if (
      n.type === 'Atrule' ||
      n.type === 'Raw' ||
      n.type === 'PseudoClassSelector' ||
      n.type === 'PseudoElementSelector' ||
      n.type === 'AttributeSelector'
    )
      throw new Error('CSS @-правила, псевдо- и атрибутные селекторы не поддерживаются');
    if (n.type === 'Declaration' && (!PROPS.has(n.property.toLowerCase()) || n.important))
      throw new Error(`Неподдерживаемое CSS-свойство: ${n.property}`);
    if (n.type === 'Url' && !/^#[\w.:-]+$/.test(n.value))
      throw new Error('Внешние ресурсы запрещены');
    if (n.type === 'Function' && /^(var|env|attr|expression)$/i.test(n.name))
      throw new Error('Динамический CSS не поддерживается');
  });
  return ast;
}
function parseSource(source: string) {
  if (source.length > 2_000_000) throw new Error('SVG превышает 2 МБ');
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(source))
    throw new Error('DOCTYPE, ENTITY и внешние таблицы стилей запрещены');
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.localName !== 'svg' || root.namespaceURI !== NS)
    throw new Error('Некорректный SVG');
  const ids = new Set<string>();
  const refs: string[] = [];
  const scanCss = (text: string, context: 'stylesheet' | 'declarationList' | 'value') =>
    css.walk(parseCss(text, context), (n) => {
      if (n.type === 'Url') refs.push(n.value.slice(1));
    });
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (!TAGS.has(el.localName) || el.namespaceURI !== NS)
      throw new Error(
        `Элемент ${el.localName} не поддерживается. Нужен статический вектор без image, script и foreignObject.`,
      );
    if (el.id) {
      if (ids.has(el.id)) throw new Error('Повторяющийся SVG id');
      ids.add(el.id);
    }
    if (el.localName === 'style') scanCss(el.textContent ?? '', 'stylesheet');
    for (const a of el.attributes) {
      if (
        /^on/i.test(a.name) ||
        ['xml:base', 'base', 'src', 'tabindex'].includes(a.name.toLowerCase())
      )
        throw new Error('Активное содержимое запрещено');
      if (a.localName === 'href') {
        if (!/^#[\w.:-]+$/.test(a.value)) throw new Error('Разрешены только локальные ссылки');
        refs.push(a.value.slice(1));
      }
      if (a.name === 'style') scanCss(a.value, 'declarationList');
      else if (/url\s*\(/i.test(a.value)) scanCss(a.value, 'value');
    }
  }
  if (refs.some((id) => !ids.has(id)))
    throw new Error('SVG ссылается на отсутствующий внутренний элемент');
  return root;
}
export function importSvg(source: string, name: string): Asset {
  const root = parseSource(source);
  const vb = root
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const dimension = (name: string) => {
    const value = root.getAttribute(name) ?? '';
    return /^\d+(\.\d+)?(px)?$/.test(value) ? parseFloat(value) : NaN;
  };
  const width = vb?.[2] ?? dimension('width');
  const height = vb?.[3] ?? dimension('height');
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    (vb && (vb.length !== 4 || vb.some((n) => !Number.isFinite(n))))
  )
    throw new Error('Нужен корректный viewBox либо размеры в px');
  return {
    id: uid(),
    name: name.replace(/\.svg$/i, ''),
    source,
    viewBox: vb ? vb.join(' ') : `0 0 ${width} ${height}`,
    width,
    height,
    tags: [],
    role: 'main',
    family: name.replace(/\.svg$/i, ''),
    detail: 'L',
  };
}
function rewriteCss(
  text: string,
  context: 'stylesheet' | 'declarationList' | 'value',
  ids: Map<string, string>,
  scope: string,
  paint?: (v: string) => string,
) {
  const ast = css.parse(text, { context });
  css.walk(ast, (n) => {
    if (n.type === 'IdSelector') n.name = ids.get(n.name) ?? n.name;
    if (n.type === 'Url') n.value = `#${ids.get(n.value.slice(1)) ?? n.value.slice(1)}`;
    if (n.type === 'Declaration' && PAINT.has(n.property.toLowerCase()) && paint) {
      const value = css.generate(n.value);
      n.value = css.parse(remapPaint(value, paint), { context: 'value' }) as css.Value;
    }
  });
  if (context === 'stylesheet')
    css.walk(ast, (n) => {
      if (n.type === 'Rule' && n.prelude?.type === 'SelectorList')
        n.prelude.children.forEach((s) => {
          if (s.type === 'Selector') {
            s.children.prependData({ type: 'Combinator', name: ' ' });
            s.children.prependData({ type: 'IdSelector', name: scope });
          }
        });
    });
  return css.generate(ast);
}
// Original source stays byte-for-byte intact. Rendering works on a parsed clone only.
export function assetMarkup(
  asset: Asset,
  prefix: string,
  palette: Palette | null = null,
  backdrop?: { width: number; height: number },
): string {
  const root = new DOMParser().parseFromString(asset.source, 'image/svg+xml').documentElement;
  const els = [root, ...root.querySelectorAll('*')];
  const ids = new Map<string, string>();
  const scope = `scope-${prefix}`;
  const colors: string[] = [];
  for (const el of els) {
    if (el.id) ids.set(el.id, `${prefix}-${el.id}`);
    for (const a of el.attributes) {
      if (PAINT.has(a.name) && literal(a.value)) colors.push(a.value);
      if (a.name === 'style')
        css.walk(css.parse(a.value, { context: 'declarationList' }), (n) => {
          if (n.type === 'Declaration' && PAINT.has(n.property) && literal(css.generate(n.value)))
            colors.push(css.generate(n.value));
        });
    }
    if (el.localName === 'style')
      css.walk(css.parse(el.textContent ?? ''), (n) => {
        if (n.type === 'Declaration' && PAINT.has(n.property) && literal(css.generate(n.value)))
          colors.push(css.generate(n.value));
      });
  }
  const paint = palette ? paintMapper(palette, colors, asset.role) : undefined;
  for (const el of els) {
    if (el.localName === 'style')
      el.textContent = rewriteCss(el.textContent ?? '', 'stylesheet', ids, scope, paint);
    for (const a of [...el.attributes]) {
      let v = a.value;
      if (a.name === 'id') v = ids.get(v)!;
      else if (a.localName === 'href') v = `#${ids.get(v.slice(1))}`;
      else if (a.name === 'style') v = rewriteCss(v, 'declarationList', ids, scope, paint);
      else if (/url\s*\(/i.test(v)) {
        v = rewriteCss(v, 'value', ids, scope);
        if (paint && PAINT.has(a.name)) v = remapPaint(v, paint);
      } else if (paint && PAINT.has(a.name)) v = paint(v);
      el.setAttributeNS(a.namespaceURI, a.name, v);
    }
  }
  // Apply implicit paint once, after remapping the original explicit paints.
  if (paint) {
    if (!root.hasAttribute('fill')) root.setAttribute('fill', palette!.neutral[0]);
    if (!root.hasAttribute('color')) root.setAttribute('color', palette!.neutral[0]);
  }
  root.setAttribute('viewBox', asset.viewBox);
  root.setAttribute('width', String(backdrop?.width ?? asset.width));
  root.setAttribute('height', String(backdrop?.height ?? asset.height));
  root.setAttribute('x', String(backdrop ? 0 : -asset.width / 2));
  root.setAttribute('y', String(backdrop ? 0 : -asset.height / 2));
  if (backdrop) root.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  root.setAttribute('overflow', 'hidden');
  return `<g xmlns="${NS}" id="${scope}">${new XMLSerializer().serializeToString(root)}</g>`;
}
export function exportSvg(project: Project) {
  const doc = document.implementation.createDocument(NS, 'svg');
  const root = doc.documentElement;
  root.setAttribute('viewBox', `0 0 ${project.width} ${project.height}`);
  root.setAttribute('width', String(project.width));
  root.setAttribute('height', String(project.height));
  root.setAttribute('overflow', 'hidden');
  const viewport = doc.createElementNS(NS, 'svg');
  viewport.setAttribute('width', String(project.width));
  viewport.setAttribute('height', String(project.height));
  viewport.setAttribute('viewBox', `0 0 ${project.width} ${project.height}`);
  viewport.setAttribute('overflow', 'hidden');
  root.appendChild(viewport);
  const add = (asset: Asset, id: string, markup: string, t?: string) => {
    const g = doc.createElementNS(NS, 'g');
    g.id = `item-${id}`;
    g.setAttribute('data-component', asset.name);
    g.setAttribute('data-source-id', asset.id);
    g.setAttribute('data-role', asset.role);
    if (t) g.setAttribute('transform', t);
    g.appendChild(
      doc.importNode(
        new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement,
        true,
      ),
    );
    viewport.appendChild(g);
  };
  if (project.backdropId) {
    const a = project.assets.find((a) => a.id === project.backdropId);
    if (!a || a.role !== 'backdrop') throw new Error('Фон отсутствует в библиотеке');
    add(a, 'backdrop', assetMarkup(a, 'export-backdrop', project.palette, project));
  }
  for (const item of project.items) {
    const a = project.assets.find((a) => a.id === item.assetId);
    if (!a || a.role === 'backdrop') throw new Error('Объект отсутствует в библиотеке');
    add(
      a,
      item.id,
      assetMarkup(a, `export-${item.id}`, project.palette),
      transform(item, project.scale),
    );
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(root);
}
export function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
