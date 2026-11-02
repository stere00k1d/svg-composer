import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, RefObject } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Frame,
  Hand,
  Maximize,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  RotateCw,
  Undo2,
} from 'lucide-react';
import type { Format, Item, Project } from '../model';
import { FORMATS, outsideSafe, transform } from '../model';
import { SvgContent } from './Artwork';
interface Props {
  p: Project;
  selected?: string;
  svgRef: RefObject<SVGSVGElement | null>;
  onSelect: (id?: string) => void;
  onStart: (e: PointerEvent<SVGGElement>, i: Item) => void;
  onRotate: (e: PointerEvent<SVGCircleElement>, i: Item) => void;
  onMove: (e: PointerEvent<SVGSVGElement>) => void;
  onFinish: () => void;
  onFormat: (f: Format) => void;
  safeVisible: boolean;
  onSafe: (v: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}
export function Canvas(props: Props) {
  const { p, selected, svgRef, onSelect, onStart, onRotate, onMove, onFinish } = props;
  const stage = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.5);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () =>
      setFit(
        Math.max(
          0.05,
          Math.min((element.clientWidth - 88) / p.width, (element.clientHeight - 88) / p.height),
        ),
      );
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [p.width, p.height]);
  useEffect(() => {
    setZoom(1);
  }, [p.format]);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom((z) => Math.max(0.4, Math.min(8, z * (e.deltaY > 0 ? 0.9 : 1.1))));
      }
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  const background = p.assets.find((a) => a.id === p.backdropId);
  const warnings = outsideSafe(p);
  return (
    <section className="canvas-workspace" aria-label="Рабочая область">
      <div className="canvas-toolbar">
        <div className="segmented formats">
          {Object.entries(FORMATS).map(([key, format]) => (
            <button
              key={key}
              aria-label={format.label}
              aria-pressed={p.format === key}
              className={p.format === key ? 'active' : ''}
              onClick={() => props.onFormat(key as Format)}
            >
              <span className={`format-glyph ${key}`} />
              <span>{format.label}</span>
            </button>
          ))}
        </div>
        <div className="history-tools">
          <button
            className="icon-button"
            title="Отменить · Ctrl Z"
            aria-label="Отменить"
            disabled={!props.canUndo}
            onClick={props.onUndo}
          >
            <Undo2 size={16} />
          </button>
          <button
            className="icon-button"
            title="Повторить · Ctrl Shift Z"
            aria-label="Повторить"
            disabled={!props.canRedo}
            onClick={props.onRedo}
          >
            <Redo2 size={16} />
          </button>
          <i />
          <label className="safe-toggle">
            <input
              type="checkbox"
              checked={props.safeVisible}
              onChange={(e) => props.onSafe(e.target.checked)}
            />
            <Frame size={14} />
            <span>Поля</span>
          </label>
        </div>
      </div>
      <div className="canvas-stage" ref={stage} data-testid="canvas-viewport">
        <div
          className="artboard-surround"
          style={{ width: p.width * fit * zoom, height: p.height * fit * zoom }}
        >
          <div className="artboard-label">
            <span>{p.name}</span>
            <span>
              {p.width} × {p.height}
            </span>
          </div>
          <svg
            className="canvas"
            ref={svgRef}
            data-testid="canvas"
            viewBox={`0 0 ${p.width} ${p.height}`}
            onPointerDown={() => onSelect(undefined)}
            onPointerMove={onMove}
            onPointerUp={onFinish}
            onPointerCancel={onFinish}
            onLostPointerCapture={onFinish}
          >
            {background && (
              <SvgContent
                asset={background}
                prefix="canvas-backdrop"
                palette={p.palette}
                backdrop={p}
              />
            )}
            {p.items.map((i) => {
              const a = p.assets.find((a) => a.id === i.assetId)!;
              const controlScale = 1 / (p.scale * fit * zoom);
              const hitWidth = Math.max(a.width, 22 * controlScale);
              const hitHeight = Math.max(a.height, 22 * controlScale);
              return (
                <g
                  data-testid="canvas-item"
                  data-asset-id={a.id}
                  key={i.id}
                  transform={transform(i, p.scale)}
                  onPointerDown={(e) => onStart(e, i)}
                >
                  <rect
                    x={-hitWidth / 2}
                    y={-hitHeight / 2}
                    width={hitWidth}
                    height={hitHeight}
                    fill="transparent"
                  />
                  <SvgContent asset={a} prefix={`canvas-${i.id}`} palette={p.palette} />
                  {selected === i.id && (
                    <g className="selection-ui" pointerEvents="none">
                      <rect
                        x={-a.width / 2}
                        y={-a.height / 2}
                        width={a.width}
                        height={a.height}
                        fill="none"
                        stroke="#ff6448"
                        strokeWidth={1.5 * controlScale}
                      />
                      {[-1, 1].flatMap((x) =>
                        [-1, 1].map((y) => (
                          <rect
                            key={`${x}-${y}`}
                            x={(x * a.width) / 2 - 3 * controlScale}
                            y={(y * a.height) / 2 - 3 * controlScale}
                            width={6 * controlScale}
                            height={6 * controlScale}
                            fill="#fff"
                            stroke="#ff6448"
                            strokeWidth={controlScale}
                          />
                        )),
                      )}
                      <path
                        d={`M0 ${-a.height / 2}V${-a.height / 2 - 24 * controlScale}`}
                        stroke="#ff6448"
                        strokeWidth={controlScale}
                      />
                      <circle
                        data-testid="rotation-handle"
                        cx={0}
                        cy={-a.height / 2 - 28 * controlScale}
                        r={6 * controlScale}
                        fill="#ff6448"
                        stroke="#fff"
                        strokeWidth={2 * controlScale}
                        pointerEvents="all"
                        style={{ cursor: 'crosshair' }}
                        onPointerDown={(e) => onRotate(e, i)}
                      />
                    </g>
                  )}
                </g>
              );
            })}
            {props.safeVisible && (
              <rect
                data-testid="safe-zone"
                x={p.safe}
                y={p.safe}
                width={p.width - 2 * p.safe}
                height={p.height - 2 * p.safe}
                fill="none"
                stroke="#353c4b"
                strokeWidth={1 / (fit * zoom)}
                strokeDasharray={`${3 / (fit * zoom)} ${5 / (fit * zoom)}`}
                opacity=".22"
                pointerEvents="none"
              />
            )}
          </svg>
          {!p.items.length && (
            <div className="canvas-empty">
              <div className="empty-symbol">
                <ArrowUpRight size={23} />
                <ArrowDownRight size={23} />
              </div>
              <span className="eyebrow">ВАША СЛЕДУЮЩАЯ КОМПОЗИЦИЯ</span>
              <h2>
                Сначала — идея.
                <br />
                Дальше — форма.
              </h2>
              <p>
                Опишите задумку сверху
                <br />
                или добавьте целый SVG из библиотеки.
              </p>
              <div className="empty-steps">
                <span>01 Подберите</span>
                <i />
                <span>02 Настройте</span>
                <i />
                <span>03 Экспортируйте</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="viewport-bar">
        <span className={warnings.length ? 'boundary-warning' : 'boundary-ok'}>
          {warnings.length ? (
            <>
              <Frame size={12} />
              За полем: {warnings.join(', ')}
            </>
          ) : (
            <>
              <Check size={12} />
              Геометрия сохранена
            </>
          )}
        </span>
        <div className="zoom-tools">
          <button
            aria-label="Уменьшить холст"
            title="Уменьшить"
            onClick={() => setZoom((z) => Math.max(0.4, z / 1.2))}
          >
            <Minus size={14} />
          </button>
          <button
            className="zoom-number"
            aria-label="Масштаб 100%"
            title="Показать в масштабе 100%"
            onClick={() => setZoom(Math.min(8, 1 / fit))}
          >
            {Math.round(fit * zoom * 100)}%
          </button>
          <button
            aria-label="Увеличить холст"
            title="Увеличшить"
            onClick={() => setZoom((z) => Math.min(8, z * 1.2))}
          >
            <Plus size={14} />
          </button>
          <i />
          <button aria-label="Вписать холст" title="Вписать в окно" onClick={() => setZoom(1)}>
            <Maximize size={14} />
          </button>
        </div>
        <span className="canvas-tip">
          <MousePointer2 size={12} />
          Перемещение <span>·</span>
          <RotateCw size={12} />
          Поворот <span>·</span>
          <Hand size={12} />
          Ctrl + колесо
        </span>
      </div>
    </section>
  );
}
