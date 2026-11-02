import { ArrowUpRight, Check, Columns3 } from 'lucide-react';
import type { Project, Template } from '../model';
import { TEMPLATES } from '../model';
import { Artwork } from './Artwork';
export interface Variant {
  key: Template;
  project: Project;
  explanation: string[];
}
export function Variants({
  variants,
  active,
  onApply,
}: {
  variants: Variant[];
  active?: Template;
  onApply: (v: Variant) => void;
}) {
  if (!variants.length) return null;
  return (
    <section className="variants-tray" aria-label="Варианты композиции">
      <div className="variants-caption">
        <div>
          <Columns3 size={14} />
          <strong>Одна идея. Три решения.</strong>
          <span>Выберите композицию и доработайте её на холсте.</span>
        </div>
        <span>03 варианта</span>
      </div>
      <div className="variant-list">
        {variants.map((v, n) => (
          <button
            key={v.key}
            data-testid={`variant-${v.key}`}
            aria-label={`Выбрать вариант ${TEMPLATES[v.key]}`}
            aria-pressed={v.key === active}
            className={`variant-card ${v.key === active ? 'active' : ''}`}
            onClick={() => onApply(v)}
          >
            <div className="variant-art">
              <Artwork project={v.project} prefix={`variant-${v.key}`} />
              {v.key === active ? (
                <span className="variant-check">
                  <Check size={12} />
                </span>
              ) : (
                <span className="variant-arrow">
                  <ArrowUpRight size={13} />
                </span>
              )}
            </div>
            <span className="variant-name">
              <b>0{n + 1}</b>
              {TEMPLATES[v.key]}
              <small>{['Опора и баланс', 'Направление и ритм', 'Воздух для текста'][n]}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
