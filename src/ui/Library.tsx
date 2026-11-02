import {
  Check,
  CheckCheck,
  ChevronDown,
  FileImage,
  Focus,
  Layers3,
  LibraryBig,
  Plus,
  Search,
  Upload,
  X,
} from 'lucide-react';
import type { ChangeEvent, MutableRefObject } from 'react';
import type { Asset, Detail, Project, Role } from '../model';
import { SvgContent } from './Artwork';
const refImages = Object.entries(
  import.meta.glob('../../assets/figma/archive-2/SVG-drop*.png', {
    import: 'default',
    eager: true,
  }),
) as [string, string][];
interface Props {
  p: Project;
  panel: 'library' | 'layers' | 'references';
  setPanel: (v: 'library' | 'layers' | 'references') => void;
  role: Role;
  setRole: (v: Role) => void;
  search: string;
  setSearch: (v: string) => void;
  chosen: string[];
  setChosen: (v: string[]) => void;
  selected?: string;
  onSelect: (id: string) => void;
  onAdd: (a: Asset) => void;
  onUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  importRole: MutableRefObject<Role>;
  importDetail: MutableRefObject<Detail>;
  onDetail: (d: Detail) => void;
  onReorder: (n: number) => void;
  focusId?: string;
  onFocus: (id: string) => void;
  onBuild: () => void;
}
export function Library(props: Props) {
  const { p, role, chosen } = props;
  const list = p.assets.filter(
    (a) =>
      a.detail === p.detail &&
      a.role === role &&
      `${a.name} ${a.tags.join(' ')}`.toLowerCase().includes(props.search.toLowerCase()),
  );
  const backdrop = p.assets.find((a) => a.id === p.backdropId);
  return (
    <aside className="library-panel">
      <div className="panel-tabs">
        <button
          className={props.panel === 'library' ? 'active' : ''}
          onClick={() => props.setPanel('library')}
        >
          <LibraryBig size={15} />
          Компоненты<span>{p.assets.filter((a) => a.role !== 'backdrop').length}</span>
        </button>
        <button
          className={props.panel === 'layers' ? 'active' : ''}
          onClick={() => props.setPanel('layers')}
        >
          <Layers3 size={15} />
          Слои<span>{p.items.length}</span>
        </button>
      </div>
      {props.panel === 'layers' ? (
        <>
          <div className="panel-subhead">
            <span>Выше в списке — ближе к вам</span>
            <div className="layer-actions">
              <button
                disabled={!props.selected}
                aria-label="↑ Выше"
                title="Выше"
                onClick={() => props.onReorder(1)}
              >
                ↑
              </button>
              <button
                disabled={!props.selected}
                aria-label="↓ Ниже"
                title="Ниже"
                onClick={() => props.onReorder(-1)}
              >
                ↓
              </button>
            </div>
          </div>
          <ol className="layer-list">
            {[...p.items].reverse().map((i) => {
              const a = p.assets.find((a) => a.id === i.assetId)!;
              return (
                <li key={i.id}>
                  <button
                    className={props.selected === i.id ? 'active' : ''}
                    onClick={() => props.onSelect(i.id)}
                  >
                    <svg viewBox={`${-a.width / 2} ${-a.height / 2} ${a.width} ${a.height}`}>
                      <SvgContent asset={a} prefix={`layer-${i.id}`} palette={p.palette} />
                    </svg>
                    <span>
                      {a.name}
                      <small>
                        {a.role === 'main' ? 'Главный объект' : 'Фоновый объект'} · {a.detail}
                      </small>
                    </span>
                    <Layers3 size={12} />
                  </button>
                </li>
              );
            })}
          </ol>
          {!p.items.length && (
            <div className="panel-empty">
              <Layers3 size={25} />
              <p>
                Здесь появятся слои
                <br />
                вашей композиции.
              </p>
            </div>
          )}
          {backdrop && (
            <div className="backdrop-layer">
              <FileImage size={13} />
              {backdrop.name}
              <span>нижний</span>
            </div>
          )}
        </>
      ) : props.panel === 'references' ? (
        <div className="references">
          <div className="panel-subhead">
            <span>Только для визуального сравнения</span>
            <button
              className="icon-button"
              onClick={() => props.setPanel('library')}
              aria-label="Закрыть референсы"
            >
              <X size={14} />
            </button>
          </div>
          <p>
            PNG не используются в композиции и не попадают в SVG. Авторство примеров не установлено.
          </p>
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
            <div className="library-heading">
              <div>
                <span className="eyebrow">ИСХОДНЫЕ SVG</span>
                <h2>Ваши компоненты</h2>
              </div>
              <select
                aria-label="Детализация"
                value={p.detail}
                onChange={(e) => props.onDetail(e.target.value as Detail)}
              >
                <option value="L">L</option>
                <option value="S">S</option>
              </select>
            </div>
            <label className="search-box">
              <Search size={15} />
              <input
                aria-label="Поиск компонентов"
                placeholder="Найти компонент…"
                value={props.search}
                onChange={(e) => props.setSearch(e.target.value)}
              />
              <kbd>/</kbd>
            </label>
            <div className="role-filter">
              {(['main', 'background', 'backdrop'] as Role[]).map((r) => (
                <button
                  key={r}
                  className={role === r ? 'active' : ''}
                  onClick={() => props.setRole(r)}
                >
                  {r === 'main' ? 'Главные' : r === 'background' ? 'Фоновые' : 'Фоны'}
                </button>
              ))}
            </div>
            <div className="selection-caption">
              <span>
                {list.length} компонентов · {p.detail}
              </span>
              <button
                title="Выбрать все видимые"
                onClick={() =>
                  props.setChosen([
                    ...new Set([
                      ...chosen,
                      ...list.filter((a) => a.role !== 'backdrop').map((a) => a.id),
                    ]),
                  ])
                }
              >
                <CheckCheck size={13} />
                Выбрать
              </button>
            </div>
          </div>
          <div className="asset-list">
            {list.map((a) => (
              <div key={a.id} className={`asset-card ${chosen.includes(a.id) ? 'chosen' : ''}`}>
                <button
                  className="asset"
                  aria-label={a.name}
                  title={`${a.name} · добавить на холст`}
                  onClick={() => props.onAdd(a)}
                >
                  <svg
                    viewBox={`${-a.width / 2} ${-a.height / 2} ${a.width} ${a.height}`}
                    aria-hidden="true"
                  >
                    <SvgContent asset={a} prefix={`preview-${a.id}`} palette={p.palette} />
                  </svg>
                  <span>{a.name}</span>
                </button>
                {a.role !== 'backdrop' && (
                  <>
                    <label className="asset-check" title="Включить в автоматическую сборку">
                      <input
                        type="checkbox"
                        aria-label={`В автосборку: ${a.name}`}
                        checked={chosen.includes(a.id)}
                        onChange={(e) =>
                          props.setChosen(
                            e.target.checked
                              ? [...chosen, a.id]
                              : chosen.filter((id) => id !== a.id),
                          )
                        }
                      />
                      <span>
                        <Check size={10} />
                      </span>
                    </label>
                    {chosen.includes(a.id) && (
                      <button
                        aria-label={`Фокус: ${a.name}`}
                        title="Сделать фокусным объектом"
                        className={`focus-asset ${props.focusId === a.id ? 'active' : ''}`}
                        onClick={() => props.onFocus(a.id)}
                      >
                        <Focus size={12} />
                      </button>
                    )}
                  </>
                )}
                <span className="asset-size">
                  {a.width} × {a.height}
                </span>
              </div>
            ))}
            {!list.length && (
              <div className="panel-empty">
                <Search size={24} />
                <p>
                  Совпадений нет.
                  <br />
                  Попробуйте другое название.
                </p>
              </div>
            )}
          </div>
          <div className="library-selection">
            <div>
              <span>{chosen.length ? `${chosen.length} выбрано` : 'Выберите предметы'}</span>
              {chosen.length > 0 && (
                <button className="text-button" onClick={() => props.setChosen([])}>
                  Снять выбор
                </button>
              )}
            </div>
            <button
              className="build-selected"
              aria-label="Собрать композицию →"
              onClick={props.onBuild}
              disabled={!chosen.length}
            >
              Собрать из выбранных
              <Plus size={14} />
            </button>
          </div>
        </>
      )}
      <div className="library-footer">
        <details className="import-drawer">
          <summary>
            <Upload size={13} />
            Добавить свои SVG
            <ChevronDown size={12} />
          </summary>
          <div className="import-options">
            <label>
              Роль
              <select
                aria-label="Роль импорта"
                defaultValue="main"
                onChange={(e) => {
                  props.importRole.current = e.target.value as Role;
                }}
              >
                <option value="main">Главный</option>
                <option value="background">Фоновый</option>
                <option value="backdrop">Фон холста</option>
              </select>
            </label>
            <label>
              Набор
              <select
                aria-label="Размер импорта"
                defaultValue="L"
                onChange={(e) => {
                  props.importDetail.current = e.target.value as Detail;
                }}
              >
                <option>L</option>
                <option>S</option>
              </select>
            </label>
          </div>
          <label className="upload">
            Выбрать SVG
            <input
              type="file"
              accept=".svg,image/svg+xml"
              multiple
              aria-label="Импорт SVG"
              onChange={props.onUpload}
            />
          </label>
        </details>
        <button
          className="reference-link"
          onClick={() => props.setPanel(props.panel === 'references' ? 'library' : 'references')}
        >
          <FileImage size={13} />
          Референсы из Figma<span>↗</span>
        </button>
        <p>
          <span />
          Только исходные векторы. Всегда.
        </p>
      </div>
    </aside>
  );
}
