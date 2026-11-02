import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent, ChangeEvent } from 'react';
import type { Asset, Detail, Format, Item, Project, Role, Template } from './model';
import { adaptFormat, createItem, uid } from './model';
import { download, exportSvg, importSvg } from './svg';
import { newProject } from './library';
import { PALETTES, parsePalette } from './palettes';
import { parseProject } from './project';
import { assemble, parsePrompt } from './planner';
import { PROMPT_EXAMPLES } from './semantics';
import {
  Asterisk,
  ArrowRight,
  ArrowUpRight,
  CircleCheck,
  FolderOpen,
  Info,
  Plus,
  Save,
} from 'lucide-react';
import { Library } from './ui/Library';
import { Canvas } from './ui/Canvas';
import { Inspector } from './ui/Inspector';
import { Variants } from './ui/Variants';
import type { Variant } from './ui/Variants';
const STORAGE = 'forma-local-project-v1';
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
  const [chosen, setChosen] = useState<string[]>(() => [...new Set(p.items.map((i) => i.assetId))]);
  const [focus, setFocus] = useState<string>();
  const [role, setRole] = useState<Role>('main');
  const [search, setSearch] = useState('');
  const [panel, setPanel] = useState<'library' | 'layers' | 'references'>('library');
  const [prompt, setPrompt] = useState('');
  const [explanation, setExplanation] = useState<string[]>([]);
  const [selectionExplanation, setSelectionExplanation] = useState<string[]>([]);
  const [safeVisible, setSafeVisible] = useState(true);
  const [message, setMessage] = useState('Готово к работе · исходная библиотека L');
  const [saved, setSaved] = useState('Локальный проект');
  const [history, setHistory] = useState<Project[]>([]);
  const [future, setFuture] = useState<Project[]>([]);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    id: string;
    dx: number;
    dy: number;
    before: Project;
    mode: 'move' | 'rotate';
    angle?: number;
    rotation?: number;
  } | null>(null);
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

  const variants = useMemo<Variant[]>(() => {
    const list = p.assets.filter(
      (a) => a.detail === p.detail && chosen.includes(a.id) && a.role !== 'backdrop',
    );
    if (!list.length || list.length > 24) return [];
    try {
      return (['balanced', 'offset', 'headline'] as Template[]).map((key) => {
        const r = assemble(p, list, key, focus);
        return { key, project: r.project, explanation: r.explanation };
      });
    } catch {
      return [];
    }
  }, [p.assets, p.detail, p.width, p.height, p.safe, p.palette, p.backdropId, chosen, focus]);
  function chooseFocus(id: string) {
    if (!chosen.includes(id)) setSelectionExplanation([]);
    setFocus(id);
    setChosen((c) => (c.includes(id) ? c : [...c, id]));
    setMessage('Фокус выбран. Примените один из трёх вариантов.');
  }
  function applyVariant(v: Variant) {
    commit({
      ...p,
      template: v.key,
      scale: v.project.scale,
      items: v.project.items,
      layoutWidth: v.project.layoutWidth,
      layoutHeight: v.project.layoutHeight,
    });
    setSelected(undefined);
    setExplanation([...selectionExplanation, ...v.explanation]);
    setMessage('Вариант применён. Предметы можно довести вручную.');
  }
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
    const matchingId = (id: string) => {
      const current = p.assets.find((a) => a.id === id);
      return p.assets.find(
        (a) => a.detail === value && a.family === current?.family && a.role === current?.role,
      )?.id;
    };
    setChosen(chosen.map(matchingId).filter((id): id is string => !!id));
    setFocus(focus ? matchingId(focus) : undefined);
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
    drag.current = { id: i.id, dx: q.x - i.x, dy: q.y - i.y, before: p, mode: 'move' };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function startRotate(e: PointerEvent<SVGCircleElement>, i: Item) {
    e.stopPropagation();
    const q = point(e);
    drag.current = {
      id: i.id,
      dx: 0,
      dy: 0,
      before: p,
      mode: 'rotate',
      angle: Math.atan2(q.y - i.y, q.x - i.x),
      rotation: i.rotation,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d) return;
    const q = point(e);
    setP((current) => ({
      ...current,
      items: current.items.map((i) => {
        if (i.id !== d.id) return i;
        if (d.mode === 'rotate') {
          let r = d.rotation! + ((Math.atan2(q.y - i.y, q.x - i.x) - d.angle!) * 180) / Math.PI;
          if (e.shiftKey) r = Math.round(r / 15) * 15;
          return { ...i, rotation: Math.round(r * 10) / 10 };
        }
        return { ...i, x: q.x - d.dx, y: q.y - d.dy };
      }),
    }));
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
      setSelectionExplanation([]);
      setFocus(undefined);
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
  function build(text = false, brief = prompt) {
    protect(() => {
      let list = p.assets.filter(
        (a) => chosen.includes(a.id) && a.detail === p.detail && a.role !== 'backdrop',
      );
      let logs: string[] = [];
      let template = p.template;
      let focusId = focus;
      if (text) {
        const parsed = parsePrompt(
          brief,
          p.assets.filter((a) => a.detail === p.detail),
        );
        list = parsed.matches;
        template = parsed.template;
        logs = parsed.explanation;
        focusId = parsed.focusId;
        setFocus(focusId);
      }
      if (!list.length) {
        setExplanation(logs);
        setMessage('Нет подходящих компонентов. Укажите точные названия или теги.');
        return;
      }
      const base = !p.items.length
        ? {
            ...p,
            palette: p.palette ?? PALETTES[0],
            backdropId:
              p.backdropId ?? 'original-backdrop-' + (p.detail === 'S' ? 'S-' : '') + 'lavender',
          }
        : p;
      const result = assemble(base, list, template, focusId);
      if (text && p.name === 'Новая композиция') result.project.name = brief.slice(0, 80);
      commit(result.project);
      setSelected(undefined);
      setChosen(list.map((a) => a.id));
      setExplanation([...logs, ...result.explanation]);
      setSelectionExplanation(logs);
      setMessage('Композиция собрана локальным алгоритмом');
    });
  }
  function demo(index: number) {
    protect(() => {
      const base = newProject();
      const formats: Format[] = ['landscape', 'square', 'portrait'];
      const templates: Template[] = ['balanced', 'offset', 'headline'];
      const families = [
        ['book', 'phone', 'puzzle', 'pen', 'lamp'],
        ['phone', 'flowers', 'headphones'],
        ['wallet', 'coin', 'phone'],
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
          a.role ===
            ((index === 1 && a.family === 'flowers') || (index === 2 && a.family === 'phone')
              ? 'background'
              : 'main'),
      );
      const hero = list.find((a) => a.family === ['book', 'headphones', 'wallet'][index]);
      const result = assemble(next, list, templates[index], hero?.id);
      setFocus(hero?.id);
      setPrompt(
        ['Книга, телефон, лампа, ручка, пазлы', 'Поймать ритм', 'Финансовая подушка'][index],
      );
      setSelectionExplanation([]);
      commit(result.project);
      setChosen(list.map((a) => a.id));
      setSelected(undefined);
      setExplanation(result.explanation);
      setMessage('Пример собран только из исходных SVG размера L');
    });
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mod && e.key.toLowerCase() === 'd' && selected) {
        e.preventDefault();
        duplicate();
      } else if (e.key === 'Escape') setSelected(undefined);
      else if (e.key === '/') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('[aria-label="Поиск компонентов"]')?.focus();
      } else if (item && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        updateItem({
          x: item.x + (e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0),
          y: item.y + (e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0),
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [p, selected, history, future]);
  return (
    <main className="studio-app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <Asterisk size={27} strokeWidth={2} />
          </span>
          <div>
            <strong>
              forma<span>/02</span>
            </strong>
            <small>COMPOSITION DESK</small>
          </div>
        </div>
        <div className="project-heading">
          <span className="document-slash">/</span>
          <input
            aria-label="Название проекта"
            value={p.name}
            onChange={(e) => setP({ ...p, name: e.target.value })}
          />
          <span className="saved-badge">
            <CircleCheck size={12} />
            {saved}
          </span>
        </div>
        <div className="header-actions">
          <button
            className="new-project"
            onClick={() => {
              commit(newProject());
              setChosen([]);
              setSelected(undefined);
              setExplanation([]);
              setPrompt('');
              setSelectionExplanation([]);
              setFocus(undefined);
            }}
          >
            <Plus size={14} />
            <span>Новый</span>
          </button>
          <span className="header-divider" />
          <label className="icon-button file-open" title="Открыть проект JSON">
            <FolderOpen size={17} />
            <input
              aria-label="Открыть JSON"
              type="file"
              accept=".json,application/json"
              onChange={open}
            />
          </label>
          <button
            className="icon-button"
            aria-label="Сохранить JSON"
            title="Сохранить проект JSON"
            onClick={() =>
              download(JSON.stringify(p, null, 2), 'forma-project.json', 'application/json')
            }
          >
            <Save size={17} />
          </button>
          <button
            className="primary export-button"
            aria-label="Экспорт SVG"
            onClick={() =>
              protect(() => {
                download(exportSvg(p), 'composition.svg', 'image/svg+xml');
                setMessage('SVG экспортирован: отдельные векторные группы, без растра');
              })
            }
          >
            Экспорт SVG
            <ArrowUpRight size={16} />
          </button>
        </div>
      </header>
      <div className="editor-layout">
        <Library
          p={p}
          panel={panel}
          setPanel={setPanel}
          role={role}
          setRole={setRole}
          search={search}
          setSearch={setSearch}
          chosen={chosen}
          setChosen={(ids) => {
            setChosen(ids);
            setSelectionExplanation([]);
          }}
          selected={selected}
          onSelect={setSelected}
          onAdd={add}
          onUpload={upload}
          importRole={importRole}
          importDetail={importDetail}
          onDetail={detail}
          onReorder={reorder}
          focusId={focus}
          onFocus={chooseFocus}
          onBuild={() => build(false)}
        />
        <div className="work-area">
          <section className="brief-panel">
            <div className="brief-heading">
              <span className="eyebrow">ОТ СМЫСЛА К ФОРМЕ</span>
              <span className="local-mode">
                <span />
                Локальный подбор
                <Info size={12} />
                <span className="local-mode-tooltip">
                  Словарь тем, синонимов и метафор. Выбирает только исходные SVG. Не LLM.
                </span>
              </span>
            </div>
            <form
              className="brief-form"
              onSubmit={(e) => {
                e.preventDefault();
                build(true);
              }}
            >
              <textarea
                aria-label="Описание композиции"
                rows={1}
                maxLength={240}
                placeholder="О чём ваша композиция? Например, «знания — сила»"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    build(true);
                  }
                }}
              />
              <button
                className="primary compose-button"
                aria-label="Разобрать и собрать"
                disabled={!prompt.trim()}
                type="submit"
              >
                <span>Создать варианты</span>
                <ArrowRight size={16} />
              </button>
            </form>
            <div className="brief-bottom">
              <div className="prompt-examples">
                <span>Попробуйте:</span>
                {PROMPT_EXAMPLES.slice(0, 3).map((text) => (
                  <button
                    key={text}
                    onClick={() => {
                      setPrompt(text);
                      build(true, text);
                    }}
                  >
                    {text}
                    <ArrowUpRight size={10} />
                  </button>
                ))}
              </div>
              {explanation.length > 0 && (
                <details className="brief-analysis">
                  <summary>
                    <Info size={12} />
                    Как подобраны предметы
                  </summary>
                  <div role="log" className="analysis-popover">
                    <strong>Разбор запроса</strong>
                    {explanation.map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </section>
          <Canvas
            p={p}
            selected={selected}
            svgRef={svg}
            onSelect={setSelected}
            onStart={start}
            onRotate={startRotate}
            onMove={move}
            onFinish={finish}
            onFormat={(format) => commit(adaptFormat(p, format))}
            safeVisible={safeVisible}
            onSafe={setSafeVisible}
            onUndo={undo}
            onRedo={redo}
            canUndo={!!history.length}
            canRedo={!!future.length}
          />
          <Variants
            variants={variants}
            active={
              variants.find(
                (v) =>
                  Math.abs(v.project.scale - p.scale) < 1e-6 &&
                  v.project.items.length === p.items.length &&
                  v.project.items.every((i, n) => {
                    const other = p.items[n];
                    return (
                      i.assetId === other.assetId &&
                      Math.abs(i.x - other.x) < 1e-6 &&
                      Math.abs(i.y - other.y) < 1e-6 &&
                      Math.abs(i.rotation - other.rotation) < 1e-6
                    );
                  }),
              )?.key
            }
            onApply={applyVariant}
          />
          <div className="demo-strip">
            <span>ГОТОВЫЕ СЦЕНАРИИ</span>
            {['Рабочий стол', 'Музыкальная пауза', 'Под заголовок'].map((name, i) => (
              <button key={name} onClick={() => demo(i)}>
                {name} ↗
              </button>
            ))}
            <span className="demo-strip-note">Исходные SVG · S/L</span>
          </div>
        </div>
        <Inspector
          p={p}
          asset={asset}
          item={item}
          onCommit={commit}
          onUpdate={updateItem}
          onDuplicate={duplicate}
          onDelete={remove}
          onChangeState={changeState}
          onReorder={reorder}
          onPaletteUpload={paletteUpload}
          onFocus={chooseFocus}
        />
      </div>
      <footer role="status">
        <span className="status-dot" />
        {message}
        <span className="footer-note">
          <span>{p.items.length} объектов</span>
          <span>SVG → SVG</span>
          <kbd>Ctrl</kbd>
          <kbd>Z</kbd>
          <span>отмена</span>
        </span>
      </footer>
    </main>
  );
}
