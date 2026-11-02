import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Focus,
  Layers3,
  Palette as PaletteIcon,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react';
import type { ChangeEvent } from 'react';
import type { Asset, Item, Project } from '../model';
import { PALETTES } from '../palettes';
interface Props {
  p: Project;
  asset?: Asset;
  item?: Item;
  onCommit: (p: Project) => void;
  onUpdate: (patch: Partial<Item>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onChangeState: () => void;
  onReorder: (d: number) => void;
  onPaletteUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onFocus: (id: string) => void;
}
export function Inspector({ p, asset, item, ...props }: Props) {
  return (
    <aside className="inspector">
      <div className="inspector-title">
        <SlidersHorizontal size={15} />
        <span>{asset ? 'Свойства объекта' : 'Свойства композиции'}</span>
        <i />
      </div>
      <div className="inspector-scroll">
        <section className="object-inspector">
          {asset && item ? (
            <>
              <div className="object-heading">
                <div>
                  <span className="eyebrow">ЦЕЛЫЙ ИСХОДНЫЙ SVG</span>
                  <h2>{asset.name}</h2>
                </div>
                <span className="detail-badge">{asset.detail}</span>
              </div>
              <button
                className="state-button"
                aria-label="Сменить состояние"
                onClick={props.onChangeState}
              >
                <Layers3 size={13} />
                {asset.role === 'main' ? 'Главный объект' : 'Фоновый объект'}
                <span>Сменить ↔</span>
              </button>
              <div className="xy-fields">
                {(['x', 'y'] as const).map((axis) => (
                  <label className="field" key={axis}>
                    <span>
                      {axis.toUpperCase()} <small>px</small>
                    </span>
                    <input
                      aria-label={`Позиция ${axis.toUpperCase()}`}
                      type="number"
                      value={Number(item[axis].toFixed(1))}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n) && Math.abs(n) <= 1e7) props.onUpdate({ [axis]: n });
                      }}
                    />
                  </label>
                ))}
              </div>
              <label className="field">
                <span>
                  Поворот <small>°</small>
                </span>
                <div className="rotation-field">
                  <RotateCcw size={13} />
                  <input
                    aria-label="Поворот"
                    type="number"
                    step="1"
                    value={Number(item.rotation.toFixed(1))}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n) && Math.abs(n) <= 3600)
                        props.onUpdate({ rotation: n });
                    }}
                  />
                  <button
                    onClick={() => props.onUpdate({ rotation: 0 })}
                    title="Сбросить поворот"
                    aria-label="Сбросить поворот"
                  >
                    0°
                  </button>
                </div>
              </label>
              <div className="object-actions">
                <button
                  aria-label="Дублировать"
                  title="Дублировать · Ctrl D"
                  onClick={props.onDuplicate}
                >
                  <Copy size={14} />
                  Дубль
                </button>
                <button
                  aria-label="Удалить"
                  title="Удалить · Delete"
                  className="danger"
                  onClick={props.onDelete}
                >
                  <Trash2 size={14} />
                  Удалить
                </button>
              </div>
              <div className="layer-actions">
                <button aria-label="↑ Выше" onClick={() => props.onReorder(1)}>
                  <ArrowUp size={13} />
                  Выше
                </button>
                <button aria-label="↓ Ниже" onClick={() => props.onReorder(-1)}>
                  <ArrowDown size={13} />
                  Ниже
                </button>
                <button
                  aria-label="Фокус выбранного объекта"
                  title="Использовать как фокус при следующей сборке"
                  onClick={() => props.onFocus(asset.id)}
                >
                  <Focus size={13} />
                </button>
              </div>
              <details className="source-details">
                <summary>
                  Исходник {asset.width} × {asset.height}
                </summary>
                <p>
                  Геометрия и внутренние части сохраняются. Объект масштабируется вместе со всей
                  композицией.
                </p>
                <label className="field">
                  Теги через запятую
                  <input
                    aria-label="Теги компонента"
                    value={asset.tags.join(', ')}
                    onChange={(e) =>
                      props.onCommit({
                        ...p,
                        assets: p.assets.map((a) =>
                          a.id === asset.id
                            ? {
                                ...a,
                                tags: e.target.value
                                  .split(',')
                                  .map((t) => t.trim())
                                  .filter(Boolean),
                              }
                            : a,
                        ),
                      })
                    }
                  />
                </label>
              </details>
            </>
          ) : (
            <div className="selection-empty">
              <Focus size={22} />
              <h3>Всё начинается с выбора</h3>
              <p>
                Нажмите на предмет на холсте.
                <br />
                Здесь появятся его свойства.
              </p>
              <div className="keyboard-hint">
                <kbd>←</kbd>
                <kbd>↑</kbd>
                <kbd>↓</kbd>
                <kbd>→</kbd>
                <span>точное перемещение</span>
              </div>
            </div>
          )}
        </section>
        <section>
          <div className="section-heading">
            <PaletteIcon size={14} />
            <h3>Цветовая схема</h3>
            <span>03</span>
          </div>
          <div className="palette-options">
            {PALETTES.map((palette, n) => (
              <button
                key={palette.name}
                className={`palette-button ${p.palette?.name === palette.name ? 'active' : ''}`}
                onClick={() => props.onCommit({ ...p, palette })}
              >
                <span className="palette-index">0{n + 1}</span>
                <span className="swatches">
                  {[...palette.background, ...palette.objects].map((c, n) => (
                    <i key={n} style={{ background: c }} />
                  ))}
                </span>
                <span>{palette.name}</span>
                {p.palette?.name === palette.name && <Check size={12} />}
              </button>
            ))}
          </div>
          <div className="palette-links">
            <button
              onClick={() => props.onCommit({ ...p, palette: null })}
              className={!p.palette ? 'active' : ''}
            >
              Исходные цвета
            </button>
            <label title="Палитра JSON: 3 фоновых, 3 объектных, 2 нейтральных цвета">
              <Upload size={12} />
              Своя палитра
              <input
                aria-label="Загрузить палитру JSON"
                type="file"
                accept=".json"
                onChange={props.onPaletteUpload}
              />
            </label>
          </div>
          {p.palette && !PALETTES.some((a) => a.name === p.palette?.name) && (
            <p className="hint">Своя палитра: {p.palette.name}</p>
          )}
          <label className="field">
            <span>Фон холста</span>
            <select
              aria-label="Фон холста"
              value={p.backdropId ?? ''}
              onChange={(e) => props.onCommit({ ...p, backdropId: e.target.value || null })}
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
          <div className="section-heading">
            <SlidersHorizontal size={14} />
            <h3>Композиция</h3>
          </div>
          <label className="field">
            <span>
              Единый масштаб <small>×</small>
            </span>
            <input
              aria-label="Единый масштаб объектов"
              type="number"
              min="0.001"
              max="10"
              step=".01"
              value={Number(p.scale.toFixed(4))}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n > 0 && n <= 10) props.onCommit({ ...p, scale: n });
              }}
            />
          </label>
          <label className="field">
            <span>
              Безопасное поле <small>px</small>
            </span>
            <input
              aria-label="Безопасное поле"
              type="number"
              min="0"
              max="120"
              value={p.safe}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 0 && n <= 120) props.onCommit({ ...p, safe: n });
              }}
            />
          </label>
          <p className="hint">
            Пропорции предметов связаны.
            <br />
            Никакого растяжения по одной оси.
          </p>
        </section>
        <section className="vector-note">
          <span>SVG</span>
          <div>
            <strong>Вектор остаётся вектором.</strong>
            <p>
              Отдельные группы. Исходные контуры.
              <br />
              Без растра в экспорте.
            </p>
          </div>
        </section>
      </div>
    </aside>
  );
}
