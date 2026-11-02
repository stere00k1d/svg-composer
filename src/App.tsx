import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent, ChangeEvent } from 'react';
import type { Asset, Detail, Format, Item, Project, Role, Template } from './model';
import { FORMATS, TEMPLATES, adaptFormat, createItem, outsideSafe, transform, uid } from './model';
import { assetMarkup, download, exportSvg, importSvg } from './svg';
import { newProject } from './library';
import { PALETTES, parsePalette } from './palettes';
import { parseProject } from './project';
import { assemble, parsePrompt } from './planner';
const STORAGE = 'forma-local-project-v1';
const roles: Record<Role, string> = {
  main: 'Главный',
  background: 'Фоновый',
  backdrop: 'Фон холста',
};
const SvgContent = memo(function SvgContent({
  asset,
  prefix,
  palette,
  backdrop,
}: {
  asset: Asset;
  prefix: string;
  palette: Project['palette'];
  backdrop?: { width: number; height: number };
}) {
  const html = useMemo(
    () => assetMarkup(asset, prefix, palette, backdrop),
    [asset, prefix, palette, backdrop?.width, backdrop?.height],
  );
  return <g dangerouslySetInnerHTML={{ __html: html }} />;
});
const refImages = Object.entries(
  import.meta.glob('../assets/figma/archive-2/SVG-drop*.png', { import: 'default', eager: true }),
) as [string, string][];
function load() {
  try {
    const saved = localStorage.getItem(STORAGE);
    return saved ? parseProject(saved) : newProject();
  } catch {
    return newProject();
  }
}
export default function App() {
  const [p, setP] = useState<Project>(load);
  const [selected, setSelected] = useState<string>();
  const [chosen, setChosen] = useState<string[]>([]);
  const [role, setRole] = useState<Role>('main');
  const [search, setSearch] = useState('');
  const [panel, setPanel] = useState<'library' | 'references'>('library');
  const [prompt, setPrompt] = useState('');
  const [explanation, setExplanation] = useState<string[]>([]);
  const [safeVisible, setSafeVisible] = useState(true);
  const [message, setMessage] = useState('Готово к работе · исходная библиотека L');
  const [saved, setSaved] = useState('Локальный проект');
  const [history, setHistory] = useState<Project[]>([]);
  const [future, setFuture] = useState<Project[]>([]);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; before: Project } | null>(null);
  const projectRef = useRef(p);
  projectRef.current = p;
  function commit(next: Project) {
    setHistory((h) => [...h.slice(-29), projectRef.current]);
    setFuture([]);
    setP(next);
  }
  function undo() {
    if (!history.length) return;
    setFuture((f) => [p, ...f]);
    setP(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  }
  function redo() {
    if (!future.length) return;
    setHistory((h) => [...h, p]);
    setP(future[0]);
    setFuture((f) => f.slice(1));
  }
  const item = p.items.find((i) => i.id === selected);
  const asset = p.assets.find((a) => a.id === item?.assetId);
  const warnings = outsideSafe(p);
  const backdrop = p.assets.find((a) => a.id === p.backdropId);
  const assets = p.assets.filter(
    (a) =>
      a.detail === p.detail &&
      a.role === role &&
      `${a.name} ${a.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase()),
  );
  useEffect(() => {
    setSaved('Сохранение…');
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE, JSON.stringify(p));
        setSaved('Сохранено в браузере');
      } catch {
        setSaved('Нет места: сохраните JSON');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [p]);
  useEffect(() => {
    const flush = () => {
      try {
        localStorage.setItem(STORAGE, JSON.stringify(projectRef.current));
      } catch {
        /* JSON download remains available when storage is full. */
      }
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected) {
          e.preventDefault();
          const current = projectRef.current;
          setHistory((h) => [...h.slice(-29), current]);
          setFuture([]);
          setP({ ...current, items: current.items.filter((i) => i.id !== selected) });
          setSelected(undefined);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected]);
  function protect(action: () => void) {
    try {
      action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }
  function updateItem(patch: Partial<Item>) {
    if (item)
      commit({ ...p, items: p.items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)) });
  }
  function add(a: Asset) {
    if (a.role === 'backdrop') {
      commit({ ...p, backdropId: a.id });
      return;
    }
    if (p.items.length >= 300) {
      setMessage('Лимит: 300 объектов');
      return;
    }
    const next = createItem(a, p.width / 2, p.height / 2);
    commit({ ...p, items: [...p.items, next] });
    setSelected(next.id);
    setMessage(`${a.name} добавлен · перетащите на холсте`);
  }
  function duplicate() {
    if (!item || p.items.length >= 300) return;
    const next = { ...item, id: uid(), x: item.x + 24, y: item.y + 24 };
    commit({ ...p, items: [...p.items, next] });
    setSelected(next.id);
  }
  function remove() {
    if (item) {
      commit({ ...p, items: p.items.filter((i) => i.id !== item.id) });
      setSelected(undefined);
    }
  }
  function reorder(direction: number) {
    if (!item) return;
    const list = [...p.items];
    const index = list.findIndex((i) => i.id === item.id);
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    commit({ ...p, items: list });
  }
  function changeState() {
    if (!asset || !item) return;
    const match = p.assets.find(
      (a) =>
        a.family === asset.family &&
        a.detail === asset.detail &&
        a.role === (asset.role === 'main' ? 'background' : 'main'),
    );
    if (!match) {
      setMessage('В библиотеке нет исходного SVG для другого состояния этого объекта');
      return;
    }
    updateItem({ assetId: match.id });
  }
  function detail(value: Detail) {
    const replacements = p.items.map((i) => {
      const a = p.assets.find((a) => a.id === i.assetId)!;
      return p.assets.find((b) => b.family === a.family && b.role === a.role && b.detail === value);
    });
    if (
      replacements.some((a) => !a) ||
      !p.assets.some((a) => a.detail === value && a.role !== 'backdrop')
    ) {
      setMessage(
        `Нет отдельных исходных SVG размера ${value}. Импортируйте их, выбрав этот размер при импорте.`,
      );
      return;
    }
    const currentBackdrop = p.assets.find((a) => a.id === p.backdropId);
    const backdropId = currentBackdrop
      ? (p.assets.find(
          (a) => a.role === 'backdrop' && a.detail === value && a.family === currentBackdrop.family,
        )?.id ?? null)
      : null;
    commit({
      ...p,
      detail: value,
      scale: p.scale * (p.detail === value ? 1 : value === 'S' ? 2 : 0.5),
      backdropId,
      items: p.items.map((i, n) => ({ ...i, assetId: replacements[n]!.id })),
    });
    setChosen([]);
  }
  function point(e: PointerEvent) {
    const matrix = svg.current?.getScreenCTM();
    return matrix
      ? new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse())
      : new DOMPoint();
  }
  function start(e: PointerEvent<SVGGElement>, i: Item) {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelected(i.id);
    const q = point(e);
    drag.current = { id: i.id, dx: q.x - i.x, dy: q.y - i.y, before: p };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function finish() {
    const d = drag.current;
    drag.current = null;
    if (d && d.before !== projectRef.current) {
      setHistory((h) => [...h.slice(-29), d.before]);
      setFuture([]);
    }
  }
  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    const additions: Asset[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        if (file.size > 2_000_000) throw new Error('Максимум 2 МБ на SVG');
        const a = importSvg(await file.text(), file.name);
        a.role = importRole.current;
        a.detail = importDetail.current;
        additions.push(a);
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : err}`);
      }
    }
    const current = projectRef.current;
    if (current.assets.length + additions.length > 100) {
      setMessage('Лимит библиотеки: 100 компонентов');
      return;
    }
    if (additions.length) commit({ ...current, assets: [...current.assets, ...additions] });
    setMessage([`Импортировано: ${additions.length}.`, ...errors].join(' '));
  }
  const importRole = useRef<Role>('main');
  const importDetail = useRef<Detail>('L');
  async function open(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.size > 25_000_000) throw new Error('Проект превышает 25 МБ');
      const next = parseProject(await file.text());
      commit(next);
      setSelected(undefined);
      setChosen([]);
      setExplanation([]);
      setMessage('Проект открыт: исходники, слои и палитра восстановлены');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }
  async function paletteUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.size > 20000) throw new Error('Палитра превышает 20 КБ');
      const palette = parsePalette(await file.text());
      commit({ ...projectRef.current, palette });
      setMessage(`Палитра «${palette.name}» применена ко всей композиции`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }
  function build(text = false) {
    protect(() => {
      let list = p.assets.filter(
        (a) => chosen.includes(a.id) && a.detail === p.detail && a.role !== 'backdrop',
      );
      let logs: string[] = [];
      let template = p.template;
      if (text) {
        const parsed = parsePrompt(
          prompt,
          p.assets.filter((a) => a.detail === p.detail && a.role === role),
        );
        list = parsed.matches;
        template = parsed.template;
        logs = parsed.explanation;
      }
      if (!list.length) {
        setExplanation(logs);
        setMessage('Нет подходящих компонентов. Укажите точные названия или теги.');
        return;
      }
      const result = assemble(p, list, template);
      commit(result.project);
      setSelected(undefined);
      setChosen(list.map((a) => a.id));
      setExplanation([...logs, ...result.explanation]);
      setMessage('Композиция собрана локальным алгоритмом');
    });
  }
  function demo(index: number) {
    protect(() => {
      const base = newProject();
      const formats: Format[] = ['landscape', 'square', 'portrait'];
      const templates: Template[] = ['balanced', 'offset', 'headline'];
      const families = [
        ['book', 'phone', 'puzzle', 'headphones', 'lamp'],
        ['phone', 'lamp', 'headphones'],
        ['wallet', 'coin', 'flowers'],
      ][index];
      const next = adaptFormat(
        {
          ...base,
          name: ['Рабочий стол', 'Музыкальная пауза', 'Под заголовок'][index],
          palette: PALETTES[[1, 0, 2][index]],
          backdropId: `original-backdrop-${['peach', 'lavender', 'turquoise'][index]}`,
        },
        formats[index],
      );
      const list = next.assets.filter(
        (a) =>
          a.detail === 'L' &&
          families.includes(a.family) &&
          a.role === (index === 1 && a.family === 'headphones' ? 'background' : 'main'),
      );
      const result = assemble(next, list, templates[index]);
      commit(result.project);
      setChosen(list.map((a) => a.id));
      setSelected(undefined);
      setExplanation(result.explanation);
      setMessage('Пример собран только из исходных SVG размера L');
    });
  }
  return (
    <main>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">f</span>
          <div>
            <strong>
              forma<span className="brand-dot">.</span>
            </strong>
            <small>SVG COMPOSITION STUDIO</small>
          </div>
        </div>
        <div className="project-heading">
          <input
            aria-label="Название проекта"
            value={p.name}
            onChange={(e) => setP({ ...p, name: e.target.value })}
          />
          <span>
            <i /> {saved}
          </span>
        </div>
        <div className="header-actions">
          <label className="button quiet">
            Открыть JSON
            <input
              type="file"
              aria-label="Открыть JSON"
              accept=".json,application/json"
              onChange={open}
            />
          </label>
          <button
            className="quiet"
            onClick={() =>
              download(JSON.stringify(p, null, 2), 'forma-project.json', 'application/json')
            }
          >
            Сохранить JSON
          </button>
          <button
            className="primary"
            onClick={() =>
              protect(() => {
                download(exportSvg(p), 'composition.svg', 'image/svg+xml');
                setMessage('SVG экспортирован: отдельные векторные группы, без растра');
              })
            }
          >
            Экспорт SVG <span>↗</span>
          </button>
        </div>
      </header>
      <div className="editor-layout">
        <aside className="library-panel">
          <nav className="panel-tabs">
            <button
              className={panel === 'library' ? 'active' : ''}
              onClick={() => setPanel('library')}
            >
              Библиотека <span>{p.assets.filter((a) => a.role !== 'backdrop').length}</span>
            </button>
            <button
              className={panel === 'references' ? 'active' : ''}
              onClick={() => setPanel('references')}
            >
              Референсы
            </button>
          </nav>
          {panel === 'references' ? (
            <div className="references">
              <h2>Примеры из Figma</h2>
              <p>PNG только для сравнения. На холст и в экспорт они не попадают.</p>
              {refImages.map(([path, url]) => (
                <figure key={path}>
                  <img src={url} alt={path.split('/').pop()!.replace('.png', '')} />
                  <figcaption>{path.split('/').pop()!.replace('.png', '')}</figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <>
              <div className="library-tools">
                <div className="eyebrow">ИСХОДНЫЕ КОМПОНЕНТЫ</div>
                <input
                  className="search"
                  aria-label="Поиск компонентов"
                  placeholder="Поиск по названию или тегу…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="segmented role-filter">
                  {(['main', 'background', 'backdrop'] as Role[]).map((r) => (
                    <button
                      key={r}
                      className={role === r ? 'active' : ''}
                      onClick={() => setRole(r)}
                    >
                      {r === 'main' ? 'Главные' : r === 'background' ? 'Фоновые' : 'Фоны'}
                    </button>
                  ))}
                </div>
                <div className="import-options">
                  <label>
                    Роль импорта
                    <select
                      aria-label="Роль импорта"
                      defaultValue="main"
                      onChange={(e) => {
                        importRole.current = e.target.value as Role;
                      }}
                    >
                      {Object.entries(roles).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Размер импорта
                    <select
                      aria-label="Размер импорта"
                      defaultValue="L"
                      onChange={(e) => {
                        importDetail.current = e.target.value as Detail;
                      }}
                    >
                      <option>L</option>
                      <option>S</option>
                    </select>
                  </label>
                </div>
                <label className="upload">
                  ＋ Импорт SVG
                  <input
                    aria-label="Импорт SVG"
                    type="file"
                    accept=".svg,image/svg+xml"
                    multiple
                    onChange={upload}
                  />
                </label>
              </div>
              <div className="asset-list">
                {assets.map((a) => (
                  <div className={`asset-card ${chosen.includes(a.id) ? 'chosen' : ''}`} key={a.id}>
                    <button className="asset" aria-label={a.name} onClick={() => add(a)}>
                      <svg
                        viewBox={`${-a.width / 2} ${-a.height / 2} ${a.width} ${a.height}`}
                        aria-hidden="true"
                      >
                        <SvgContent asset={a} prefix={`preview-${a.id}`} palette={p.palette} />
                      </svg>
                      <span>{a.name}</span>
                    </button>
                    {a.role !== 'backdrop' && (
                      <label className="asset-check" title="Включить в автоматическую сборку">
                        <input
                          type="checkbox"
                          aria-label={`В автосборку: ${a.name}`}
                          checked={chosen.includes(a.id)}
                          onChange={(e) =>
                            setChosen((v) =>
                              e.target.checked ? [...v, a.id] : v.filter((id) => id !== a.id),
                            )
                          }
                        />
                      </label>
                    )}
                    <span className="asset-size">
                      {a.width} × {a.height}
                    </span>
                  </div>
                ))}
                {!assets.length && (
                  <p className="muted empty-library">
                    Компонентов пока нет.
                    <br />
                    Импортируйте исходные SVG.
                  </p>
                )}
              </div>
              <div className="library-note">
                <span>◇</span>
                <p>
                  Каждый предмет — целый исходный SVG.
                  <br />
                  Никаких сгенерированных иллюстраций.
                </p>
              </div>
            </>
          )}
        </aside>
        <section className="work-area">
          <div className="canvas-toolbar">
            <div className="segmented formats">
              {Object.entries(FORMATS).map(([f, s]) => (
                <button
                  aria-label={s.label}
                  className={p.format === f ? 'active' : ''}
                  key={f}
                  onClick={() => commit(adaptFormat(p, f as Format))}
                >
                  <span className={`format-icon ${f}`} />
                  {s.label}
                </button>
              ))}
            </div>
            <div className="canvas-controls">
              <select
                aria-label="Детализация"
                value={p.detail}
                onChange={(e) => detail(e.target.value as Detail)}
              >
                <option value="L">Детализация L</option>
                <option value="S">Детализация S</option>
              </select>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={safeVisible}
                  onChange={(e) => setSafeVisible(e.target.checked)}
                />
                Безопасная зона
              </label>
              <button
                className="icon-button"
                aria-label="Отменить"
                disabled={!history.length}
                onClick={undo}
              >
                ↶
              </button>
              <button
                className="icon-button"
                aria-label="Повторить"
                disabled={!future.length}
                onClick={redo}
              >
                ↷
              </button>
            </div>
          </div>
          <div className="canvas-area">
            <div className="artboard-wrap" style={{ aspectRatio: `${p.width}/${p.height}` }}>
              <div className="artboard-label">
                {p.name}{' '}
                <span>
                  {p.width} × {p.height}
                </span>
              </div>
              <svg
                ref={svg}
                data-testid="canvas"
                className="canvas"
                viewBox={`0 0 ${p.width} ${p.height}`}
                onPointerDown={() => setSelected(undefined)}
                onPointerMove={(e) => {
                  if (!drag.current) return;
                  const d = drag.current;
                  const q = point(e);
                  setP((current) => ({
                    ...current,
                    items: current.items.map((i) =>
                      i.id === d.id ? { ...i, x: q.x - d.dx, y: q.y - d.dy } : i,
                    ),
                  }));
                }}
                onPointerUp={finish}
                onPointerCancel={finish}
                onLostPointerCapture={finish}
              >
                {backdrop && (
                  <SvgContent
                    asset={backdrop}
                    prefix="canvas-backdrop"
                    palette={p.palette}
                    backdrop={p}
                  />
                )}
                {p.items.map((i) => {
                  const a = p.assets.find((a) => a.id === i.assetId)!;
                  return (
                    <g
                      data-testid="canvas-item"
                      data-asset-id={a.id}
                      key={i.id}
                      transform={transform(i, p.scale)}
                      onPointerDown={(e) => start(e, i)}
                    >
                      <rect
                        x={-a.width / 2}
                        y={-a.height / 2}
                        width={a.width}
                        height={a.height}
                        fill="transparent"
                      />
                      <SvgContent asset={a} prefix={`canvas-${i.id}`} palette={p.palette} />
                      {selected === i.id && (
                        <rect
                          className="selection"
                          x={-a.width / 2}
                          y={-a.height / 2}
                          width={a.width}
                          height={a.height}
                          fill="none"
                          stroke="#46694c"
                          strokeWidth={2 / p.scale}
                          pointerEvents="none"
                        />
                      )}
                    </g>
                  );
                })}
                {safeVisible && (
                  <rect
                    data-testid="safe-zone"
                    x={p.safe}
                    y={p.safe}
                    width={p.width - 2 * p.safe}
                    height={p.height - 2 * p.safe}
                    fill="none"
                    stroke="#788c78"
                    strokeWidth="1"
                    strokeDasharray="5 6"
                    opacity=".55"
                    pointerEvents="none"
                  />
                )}
              </svg>
              {!p.items.length && (
                <div className="canvas-empty">
                  <span>↖</span>
                  <h2>Место для вашей композиции</h2>
                  <p>
                    Нажмите на компонент в библиотеке
                    <br />
                    или начните с готового сценария ниже.
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="canvas-caption">
            <span>
              {p.items.length} объектов · {p.width} × {p.height} px
            </span>
            <span>
              {warnings.length ? (
                <span className="warning">За безопасной зоной: {warnings.join(', ')}</span>
              ) : (
                'Пропорции объектов сохранены'
              )}{' '}
              · масштаб {p.scale.toFixed(3)}
            </span>
          </div>
          <section className="assembly-panel">
            <div className="assembly-top">
              <div>
                <div className="eyebrow">ЛОКАЛЬНЫЙ ПЛАНИРОВЩИК</div>
                <h2>Соберите новую историю</h2>
              </div>
              <span className="tag">Без генерации графики</span>
            </div>
            <div className="template-row">
              {Object.entries(TEMPLATES).map(([key, label], n) => (
                <button
                  className={`template ${p.template === key ? 'active' : ''}`}
                  key={key}
                  onClick={() => setP({ ...p, template: key as Template })}
                >
                  <span className={`template-mini mini-${n}`}>
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>
                    <strong>{label}</strong>
                    <small>
                      {
                        [
                          'Равномерное размещение',
                          'Мягкий ритм и повороты',
                          'Свободное место слева',
                        ][n]
                      }
                    </small>
                  </span>
                  <span className="radio-dot" />
                </button>
              ))}
            </div>
            <div className="build-row">
              <span className="muted">
                Выбрано {chosen.length} компонентов{' '}
                <button
                  className="text-button"
                  onClick={() =>
                    setChosen(assets.filter((a) => a.role !== 'backdrop').map((a) => a.id))
                  }
                >
                  выбрать видимые
                </button>
                <button className="text-button" onClick={() => setChosen([])}>
                  снять выбор
                </button>
              </span>
              <button className="primary" onClick={() => build(false)}>
                Собрать композицию →
              </button>
            </div>
            <details className="prompt-panel">
              <summary>
                Собрать по текстовому описанию <span>Поиск по именам и тегам, не LLM</span>
              </summary>
              <div className="prompt-row">
                <textarea
                  aria-label="Описание композиции"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Например: телефон, лампа, наушники под заголовок"
                />
                <button onClick={() => build(true)}>Разобрать и собрать</button>
              </div>
              <p className="muted">
                Поиск в категории «
                {role === 'main' ? 'Главные' : role === 'background' ? 'Фоновые' : 'Фоны'}», размер{' '}
                {p.detail}. Неизвестные слова не создают объекты.
              </p>
            </details>
            {explanation.length > 0 && (
              <div className="explanation" role="log">
                {explanation.map((line, n) => (
                  <p key={n}>{line}</p>
                ))}
              </div>
            )}
            <div className="demo-row">
              <span>Начать с примера:</span>
              {['Рабочий стол', 'Музыкальная пауза', 'Под заголовок'].map((n, i) => (
                <button key={n} onClick={() => demo(i)}>
                  {n} ↗
                </button>
              ))}
            </div>
          </section>
        </section>
        <aside className="inspector">
          <div className="inspector-title">
            Параметры композиции <span>↗</span>
          </div>
          <section>
            <h3>Цветовая схема</h3>
            <div className="palette-options">
              <button
                className={`palette-button ${!p.palette ? 'active' : ''}`}
                onClick={() => commit({ ...p, palette: null })}
              >
                <span className="original-colors">◒</span>
                <span>Исходные цвета</span>
                {!p.palette && <b>✓</b>}
              </button>
              {PALETTES.map((palette) => (
                <button
                  className={`palette-button ${p.palette?.name === palette.name ? 'active' : ''}`}
                  key={palette.name}
                  onClick={() => commit({ ...p, palette })}
                >
                  <span className="swatches">
                    {[...palette.background, ...palette.objects].map((c, n) => (
                      <i key={n} style={{ background: c }} />
                    ))}
                  </span>
                  <span>{palette.name}</span>
                  {p.palette?.name === palette.name && <b>✓</b>}
                </button>
              ))}
            </div>
            {p.palette && !PALETTES.some((a) => a.name === p.palette?.name) && (
              <p className="muted">Палитра: {p.palette.name}</p>
            )}
            <label className="button upload-palette">
              ＋ Загрузить палитру JSON
              <input
                aria-label="Загрузить палитру JSON"
                type="file"
                accept=".json"
                onChange={paletteUpload}
              />
            </label>
            <p className="hint">Фоновые объекты используют цвета фона и нейтральные цвета схемы.</p>
            <label className="field">
              Фон холста
              <select
                aria-label="Фон холста"
                value={p.backdropId ?? ''}
                onChange={(e) => commit({ ...p, backdropId: e.target.value || null })}
              >
                <option value="">Прозрачный</option>
                {p.assets
                  .filter((a) => a.role === 'backdrop' && a.detail === p.detail)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
          </section>
          <section>
            <h3>Масштаб и поля</h3>
            <label className="field">
              Единый масштаб объектов
              <input
                aria-label="Единый масштаб объектов"
                type="number"
                min="0.001"
                max="10"
                step="0.01"
                value={Number(p.scale.toFixed(4))}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n > 0 && n <= 10) commit({ ...p, scale: n });
                }}
              />
            </label>
            <p className="hint">
              Все объекты меняют размер вместе. Растяжение по одной оси отключено.
            </p>
            <label className="field">
              Безопасное поле, px
              <input
                aria-label="Безопасное поле"
                type="number"
                min="0"
                max="120"
                value={p.safe}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n >= 0 && n <= 120) commit({ ...p, safe: n });
                }}
              />
            </label>
          </section>
          <section>
            <h3>{asset ? asset.name : 'Выберите объект'}</h3>
            {item && asset ? (
              <>
                <span className="tag">
                  {roles[asset.role]} · исходный SVG {asset.detail}
                </span>
                <div className="xy-fields">
                  {(['x', 'y'] as const).map((axis) => (
                    <label className="field" key={axis}>
                      {axis.toUpperCase()}
                      <input
                        aria-label={`Позиция ${axis.toUpperCase()}`}
                        type="number"
                        value={Number(item[axis].toFixed(1))}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n) && Math.abs(n) <= 1e7) updateItem({ [axis]: n });
                        }}
                      />
                    </label>
                  ))}
                </div>
                <label className="field">
                  Поворот, °
                  <input
                    aria-label="Поворот"
                    type="number"
                    step="1"
                    value={item.rotation}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n) && Math.abs(n) <= 3600) updateItem({ rotation: n });
                    }}
                  />
                </label>
                <div className="object-actions">
                  <button onClick={duplicate}>Дублировать</button>
                  <button className="danger" onClick={remove}>
                    Удалить
                  </button>
                  <button onClick={changeState}>Сменить состояние</button>
                </div>
                <label className="field">
                  Теги через запятую
                  <input
                    aria-label="Теги компонента"
                    value={asset.tags.join(', ')}
                    onChange={(e) => {
                      const tags = e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean);
                      setP({
                        ...p,
                        assets: p.assets.map((a) => (a.id === asset.id ? { ...a, tags } : a)),
                      });
                    }}
                  />
                </label>
                <p className="hint">
                  Исходник {asset.width} × {asset.height}. Внутренние части объекта не
                  редактируются.
                </p>
              </>
            ) : (
              <p className="hint">
                Нажмите на предмет на холсте, чтобы переместить, повернуть или сменить его
                состояние.
              </p>
            )}
          </section>
          <section className="layers-section">
            <h3>
              Слои <span>{p.items.length}</span>
            </h3>
            <div className="layer-actions">
              <button disabled={!item} onClick={() => reorder(1)}>
                ↑ Выше
              </button>
              <button disabled={!item} onClick={() => reorder(-1)}>
                ↓ Ниже
              </button>
            </div>
            <ol className="layers">
              {[...p.items].reverse().map((i) => {
                const a = p.assets.find((a) => a.id === i.assetId)!;
                return (
                  <li key={i.id}>
                    <button
                      className={selected === i.id ? 'active' : ''}
                      onClick={() => setSelected(i.id)}
                    >
                      <span>◇</span>
                      {a.name}
                      <small>{a.role === 'main' ? 'главный' : 'фоновый'}</small>
                    </button>
                  </li>
                );
              })}
            </ol>
            {backdrop && <div className="backdrop-layer">▧ {backdrop.name} · нижний слой</div>}
          </section>
        </aside>
      </div>
      <footer role="status">
        <span className="status-dot" />
        {message}
        <span className="footer-note">Локально · React / TypeScript · SVG</span>
      </footer>
    </main>
  );
}
