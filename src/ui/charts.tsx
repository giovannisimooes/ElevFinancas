import React, { useEffect, useRef, useState } from "react";

function useWidth(def = 640): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(def);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => { const cw = Math.round(e[0].contentRect.width); if (cw > 50) setW(cw); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
import { formatBRL, formatBRLCompact, formatPct } from "../core/money";
import { useApp } from "./state";

interface Tip { x: number; y: number; lines: React.ReactNode[] }

function niceMax(v: number) {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return s * p;
}

/** Escala com passos "redondos" (1, 2, 2,5, 5 × 10^n). */
function niceScale(values: number[], ticks = 4) {
  const hi = Math.max(0, ...values), lo = Math.min(0, ...values);
  const step = niceMax((hi - lo || 100) / ticks);
  const min = Math.floor(lo / step) * step;
  const max = Math.max(min + step, Math.ceil(hi / step) * step);
  return { min, max, step, n: Math.round((max - min) / step) };
}

function TipBox({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return <div className="chart-tip" style={{ left: tip.x, top: tip.y }}>{tip.lines.map((l, i) => <div key={i}>{l}</div>)}</div>;
}

function Dot({ c }: { c: string }) { return <i className="dot" style={{ background: c }} />; }

export interface Series { name: string; color: string; values: number[] }

/** Barras agrupadas (ex.: receitas x despesas por mês). Valores em centavos. */
export function BarChart({ labels, series, height = 220, signed }: { labels: string[]; series: Series[]; height?: number; signed?: boolean }) {
  const { data } = useApp();
  const st = data.settings.chartStyle;
  const [tip, setTip] = useState<Tip | null>(null);
  const [ref, W] = useWidth();
  const H = height, L = 58, R = 8, T = 10, B = 26;
  const all = series.flatMap((s) => s.values);
  const sc = niceScale(signed ? all : all.map((v) => Math.max(0, v)));
  const maxV = sc.max, minV = sc.min;
  const range = maxV - minV || 1;
  const y = (v: number) => T + ((maxV - v) / range) * (H - T - B);
  const gw = (W - L - R) / Math.max(1, labels.length);
  const bw = Math.min(26, (gw * 0.7) / series.length);
  const ticks = sc.n;
  return (
    <div className="chart" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ height }} role="img">
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const v = minV + (range / ticks) * i;
          return <g key={i}>
            {st.grid && <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 0 ? "axis0" : "grid"} />}
            <text x={L - 6} y={y(v) + 4} className="tick" textAnchor="end">{formatBRLCompact(Math.round(v))}</text>
          </g>;
        })}
        {labels.map((lab, i) => {
          const gx = L + gw * i + (gw - bw * series.length) / 2;
          return <g key={lab + i} onMouseMove={(e) => {
            const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
            setTip({ x: e.clientX - r.left, y: e.clientY - r.top, lines: [<strong key="t">{lab}</strong>, ...series.map((s) => <span key={s.name}><Dot c={s.color} />{s.name}: {formatBRL(s.values[i])}</span>)] });
          }}>
            <rect x={L + gw * i} y={T} width={gw} height={H - T - B} fill="transparent" />
            {series.map((s, si) => {
              const v = s.values[i] || 0;
              const y0 = y(0), y1 = y(v);
              const h = Math.max(v === 0 ? 0 : 1.5, Math.abs(y1 - y0));
              return <rect key={s.name} className="bar" x={gx + si * bw + 1} width={bw - 2} y={v >= 0 ? y0 - h : y0} height={h} rx={st.rounded ? Math.min(5, bw / 3) : 0}
                fill={signed && v < 0 ? "var(--neg)" : s.color} />;
            })}
            <text x={L + gw * i + gw / 2} y={H - 8} className="tick" textAnchor="middle">{lab}</text>
          </g>;
        })}
      </svg>
      <TipBox tip={tip} />
      {series.length > 1 && <div className="legend">{series.map((s) => <span key={s.name}><Dot c={s.color} />{s.name}</span>)}</div>}
    </div>
  );
}

/** Linhas (evolução de saldo, fluxo previsto). */
export function LineChart({ labels, series, height = 220, dashedFrom }: { labels: string[]; series: Series[]; height?: number; dashedFrom?: number }) {
  const { data } = useApp();
  const st = data.settings.chartStyle;
  const [tip, setTip] = useState<Tip | null>(null);
  const [ref, W] = useWidth();
  const H = height, L = 60, R = 14, T = 12, B = 26;
  const all = series.flatMap((s) => s.values);
  const sc = niceScale(all);
  const maxV = sc.max, minV = sc.min;
  const range = maxV - minV || 1;
  const y = (v: number) => T + ((maxV - v) / range) * (H - T - B);
  const step = (W - L - R) / Math.max(1, labels.length - 1);
  const x = (i: number) => L + step * i;
  return (
    <div className="chart" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ height }} role="img">
        {Array.from({ length: sc.n + 1 }, (_, i) => {
          const v = minV + sc.step * i;
          return <g key={i}>{st.grid && <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 0 ? "axis0" : "grid"} />}<text x={L - 6} y={y(v) + 4} className="tick" textAnchor="end">{formatBRLCompact(Math.round(v))}</text></g>;
        })}
        {series.map((s) => {
          const pts = s.values.map((v, i) => `${x(i)},${y(v)}`);
          const solid = dashedFrom == null ? pts : pts.slice(0, dashedFrom + 1);
          const dashed = dashedFrom == null ? [] : pts.slice(dashedFrom);
          return <g key={s.name}>
            {series.length === 1 && <polygon points={`${x(0)},${y(minV < 0 ? 0 : minV)} ${pts.join(" ")} ${x(s.values.length - 1)},${y(minV < 0 ? 0 : minV)}`} fill={s.color} opacity={0.08} />}
            <polyline points={solid.join(" ")} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" className="line" />
            {dashed.length > 1 && <polyline points={dashed.join(" ")} fill="none" stroke={s.color} strokeWidth={2.5} strokeDasharray="6 5" opacity={0.8} />}
            {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={3.2} fill="var(--card)" stroke={s.color} strokeWidth={2} />)}
          </g>;
        })}
        {labels.map((lab, i) => <text key={i} x={x(i)} y={H - 8} className="tick" textAnchor="middle">{lab}</text>)}
        {labels.map((lab, i) => <rect key={"h" + i} x={x(i) - step / 2} y={T} width={step} height={H - T - B} fill="transparent"
          onMouseMove={(e) => { const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setTip({ x: e.clientX - r.left, y: e.clientY - r.top, lines: [<strong key="t">{lab}{dashedFrom != null && i > dashedFrom ? " (previsto)" : ""}</strong>, ...series.map((s) => <span key={s.name}><Dot c={s.color} />{s.name}: {formatBRL(s.values[i])}</span>)] }); }} />)}
      </svg>
      <TipBox tip={tip} />
      {series.length > 1 && <div className="legend">{series.map((s) => <span key={s.name}><Dot c={s.color} />{s.name}</span>)}</div>}
    </div>
  );
}

/** Rosca/pizza por categoria com legenda. */
export function Donut({ data: rows, colors, emptyText = "Sem dados no período", size = 168 }: { data: { name: string; cents: number }[]; colors: string[]; emptyText?: string; size?: number }) {
  const { data } = useApp();
  const donut = data.settings.chartStyle.donut;
  const [hover, setHover] = useState<number | null>(null);
  const total = rows.reduce((s, r) => s + r.cents, 0);
  if (!total) return <div className="chart-empty">{emptyText}</div>;
  const top = rows.slice(0, 7);
  const rest = rows.slice(7).reduce((s, r) => s + r.cents, 0);
  const list = rest ? [...top, { name: "Outras", cents: rest }] : top;
  const r = 70, cx = 80, cy = 80, ir = donut ? 46 : 0;
  let a0 = -Math.PI / 2;
  const arcs = list.map((row, i) => {
    const frac = row.cents / total;
    const a1 = a0 + frac * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a: number, rr: number) => `${cx + rr * Math.cos(a)} ${cy + rr * Math.sin(a)}`;
    const d = frac >= 0.9999
      ? `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0` + (ir ? ` M ${cx - ir} ${cy} a ${ir} ${ir} 0 1 1 ${2 * ir} 0 a ${ir} ${ir} 0 1 1 ${-2 * ir} 0` : "")
      : ir ? `M ${p(a0, r)} A ${r} ${r} 0 ${large} 1 ${p(a1, r)} L ${p(a1, ir)} A ${ir} ${ir} 0 ${large} 0 ${p(a0, ir)} Z`
        : `M ${cx} ${cy} L ${p(a0, r)} A ${r} ${r} 0 ${large} 1 ${p(a1, r)} Z`;
    a0 = a1;
    return <path key={row.name} d={d} fill={colors[i % colors.length]} fillRule="evenodd" className={hover === i ? "slice on" : "slice"} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />;
  });
  const h = hover != null ? list[hover] : null;
  return (
    <div className="donut">
      <svg viewBox="0 0 160 160" style={{ width: size, height: size }}>
        {arcs}
        {donut && <>
          <text x={80} y={76} textAnchor="middle" className="donut-k">{h ? h.name.slice(0, 16) : "Total"}</text>
          <text x={80} y={94} textAnchor="middle" className="donut-v">{formatBRLCompact(h ? h.cents : total)}</text>
        </>}
      </svg>
      <ul className="donut-legend">
        {list.map((row, i) => (
          <li key={row.name} className={hover === i ? "on" : ""} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <Dot c={colors[i % colors.length]} /><span className="grow ellipsis">{row.name}</span>
            <span className="muted small">{formatPct((row.cents / total) * 100, 0)}</span>
            <strong>{formatBRL(row.cents)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barras horizontais com rótulos (ranking de categorias). */
export function HBars({ rows, color, max = 8 }: { rows: { name: string; cents: number; sub?: string }[]; color: string; max?: number }) {
  const top = rows.slice(0, max);
  const m = Math.max(1, ...top.map((r) => r.cents));
  if (!top.length) return <div className="chart-empty">Sem dados no período</div>;
  return (
    <ul className="hbars">
      {top.map((r) => (
        <li key={r.name}>
          <div className="hbars-top"><span className="ellipsis">{r.name}</span><strong>{formatBRL(r.cents)}</strong></div>
          <div className="hbars-track"><div style={{ width: `${(r.cents / m) * 100}%`, background: color }} /></div>
          {r.sub && <span className="muted small">{r.sub}</span>}
        </li>
      ))}
    </ul>
  );
}
