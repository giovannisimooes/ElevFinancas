import React, { useMemo, useState } from "react";
import { LuCalendarDays, LuChevronLeft, LuChevronRight, LuTrendingUp, LuTrendingDown, LuScale, LuWallet } from "./icons";
import { useListSort, sortList } from "./sort";
import { statusRank } from "./table";
import { useApp } from "./state";
import { Empty, ItemActions, Amount, StatusBadge, cls, Button, Progress } from "./components";
import { TypeIcon } from "./table";
import { matchesProfile, dueState, monthMetrics } from "../core/engine";
import { monthParts, daysInMonth, weekday, pad, formatDateBR, monthLabel, addMonths, monthOf, makeMonth, MONTH_NAMES } from "../core/dates";
import { formatBRL } from "../core/money";
import type { Item } from "../core/types";

type Kind = "income" | "fixed" | "inst" | "card" | "overdue" | "paid" | "other";
function kindOf(it: Item, today: string): Kind {
  if (it.status === "paid") return "paid";
  if (it.isCredit) return "card";
  if (it.type !== "income" && dueState(it, today) === "overdue") return "overdue";
  if (it.type === "income") return "income";
  if (it.source === "inst") return "inst";
  if (it.source === "rec") return "fixed";
  return "other";
}
const LABEL: Record<Kind, string> = { income: "Receitas previstas", fixed: "Contas fixas", inst: "Parcelamentos", card: "Cartão de crédito", overdue: "Atrasadas", paid: "Pagas/recebidas", other: "Outras contas" };

export function CalendarPage() {
  const { data, items, view, month, setMonth, today } = useApp();
  const ls = useListSort();
  const { y, m } = monthParts(month);
  const dim = daysInMonth(y, m);
  const first = weekday(`${month}-01`);
  const [sel, setSel] = useState<string | null>(month === today.slice(0, 7) ? today : null);
  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      if (!matchesProfile(it, view) || it.type === "transfer" || it.type === "invoice" || it.pre) continue;
      if (!it.date.startsWith(month)) continue;
      (map.get(it.date) || map.set(it.date, []).get(it.date)!).push(it);
    }
    return map;
  }, [items, view, month]);
  const selected = sel && sel.startsWith(month) ? sel : null;
  const list = sortList(selected ? byDay.get(selected) || [] : [], ls, {
    date: (i) => i.date, alpha: (i) => i.description, amount: (i) => i.amountCents, category: (i) => i.category,
    type: (i) => (i.type === "income" ? 0 : 1), status: (i) => statusRank(i, today),
  });
  const sumOf = (l: Item[]) => l.reduce((s, it) => s + it.amountCents, 0);
  // Totais do mês (as mesmas movimentações que aparecem no calendário)
  const monthItems = [...byDay.values()].flat();
  const ins = monthItems.filter((it) => it.type === "income");
  const outs = monthItems.filter((it) => it.type !== "income");
  const inTotal = sumOf(ins), inDone = sumOf(ins.filter((i) => i.status === "paid"));
  const outTotal = sumOf(outs), outDone = sumOf(outs.filter((i) => i.status === "paid"));
  const result = inTotal - outTotal;
  const mm = monthMetrics(data, items, view, month, today);
  const isPast = month < monthOf(today);
  const endBalance = isPast ? mm.balanceEndOfMonth : mm.projectedEnd;
  const dayIn = list.filter((i) => i.type === "income"), dayOut = list.filter((i) => i.type !== "income");
  const goMonth = (m: string) => { setMonth(m); setSel(m === monthOf(today) ? today : null); };
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: dim }, (_, i) => `${month}-${pad(i + 1)}`)];
  while (cells.length % 7) cells.push(null);
  return (
    <div className="page">
      <div className="page-head"><div><h2>Calendário financeiro</h2><p className="muted small">{monthLabel(month)} · clique num dia para ver e pagar as movimentações.</p></div></div>
      <CalMonthBar month={month} today={today} onChange={goMonth} />
      <div className="legend cal-legend">{(Object.keys(LABEL) as Kind[]).map((k) => <span key={k}><i className={cls("cdot", `k-${k}`)} />{LABEL[k]}</span>)}</div>
      <div className="cal-wrap">
        <section className="panel cal">
          <div className="cal-grid head">{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <div key={d}>{d}</div>)}</div>
          <div className="cal-grid">
            {cells.map((d, i) => {
              if (!d) return <div key={"e" + i} className="cal-cell empty" />;
              const its = byDay.get(d) || [];
              const kinds = [...new Set(its.map((it) => kindOf(it, today)))];
              const tin = its.filter((it) => it.type === "income").reduce((s, it) => s + it.amountCents, 0);
              const tout = its.filter((it) => it.type !== "income").reduce((s, it) => s + it.amountCents, 0);
              return (
                <button key={d} className={cls("cal-cell", d === today && "today", d === selected && "sel", its.length && "has")} onClick={() => setSel(d)}>
                  <span className="cal-day">{Number(d.slice(8))}</span>
                  <span className="cal-dots">{kinds.map((k) => <i key={k} className={cls("cdot", `k-${k}`)} />)}</span>
                  {tin > 0 && <span className="cal-amt pos">+{formatBRL(tin).replace("R$", "").trim()}</span>}
                  {tout > 0 && <span className="cal-amt neg">−{formatBRL(tout).replace("R$", "").trim()}</span>}
                </button>
              );
            })}
          </div>
        </section>
        <section className="panel cal-side">
          <header className="panel-head"><span className="panel-icon"><LuCalendarDays /></span><h3>{selected ? formatDateBR(selected) : "Selecione um dia"}</h3></header>
          {selected && list.length > 0 && (
            <div className="day-sum">
              <div><span>Receber no dia</span><b className="pos">{formatBRL(sumOf(dayIn))}</b></div>
              <div><span>Pagar no dia</span><b className="neg">{formatBRL(sumOf(dayOut))}</b></div>
              <div><span>Saldo do dia</span><b className={sumOf(dayIn) - sumOf(dayOut) < 0 ? "neg" : "pos"}>{formatBRL(sumOf(dayIn) - sumOf(dayOut))}</b></div>
            </div>
          )}
          {!selected ? <Empty title="Nenhum dia selecionado" /> : !list.length ? <Empty title="Sem movimentações neste dia" /> : (
            <ul className="day-list">{list.map((it) => (
              <li key={it.key}>
                <div className="row gap align-center"><TypeIcon it={it} /><div className="grow minw0"><div className="ellipsis">{it.description}</div><div className="small muted">{it.category}</div></div><Amount item={it} /></div>
                <div className="row between align-center"><StatusBadge item={it} /><ItemActions item={it} compact /></div>
              </li>
            ))}</ul>
          )}
        </section>
      </div>

      <div className="cal-totals">
        <div className="cal-total t-in">
          <div className="ct-top"><span className="ct-icon"><LuTrendingUp /></span><span>Total a receber em {monthLabel(month).split(" ")[0].toLowerCase()}</span></div>
          <strong className="pos">{formatBRL(inTotal)}</strong>
          <Progress value={inTotal ? (inDone / inTotal) * 100 : 0} tone="ok" />
          <div className="ct-sub"><span>Recebido <b>{formatBRL(inDone)}</b></span><span>Falta <b>{formatBRL(inTotal - inDone)}</b></span></div>
        </div>
        <div className="cal-total t-out">
          <div className="ct-top"><span className="ct-icon"><LuTrendingDown /></span><span>Total a pagar em {monthLabel(month).split(" ")[0].toLowerCase()}</span></div>
          <strong className="neg">{formatBRL(outTotal)}</strong>
          <Progress value={outTotal ? (outDone / outTotal) * 100 : 0} tone="danger" />
          <div className="ct-sub"><span>Pago <b>{formatBRL(outDone)}</b></span><span>Falta <b>{formatBRL(outTotal - outDone)}</b></span></div>
        </div>
        <div className={cls("cal-total", result >= 0 ? "t-pos" : "t-neg")}>
          <div className="ct-top"><span className="ct-icon"><LuScale /></span><span>{result >= 0 ? "Sobra no mês" : "Falta no mês"}</span></div>
          <strong className={result >= 0 ? "pos" : "neg"}>{formatBRL(result)}</strong>
          <div className="ct-sub"><span>{result >= 0 ? "Você fecha o mês no positivo" : "Você fecha o mês no negativo"} (a receber − a pagar)</span></div>
        </div>
        <div className="cal-total t-bal">
          <div className="ct-top"><span className="ct-icon"><LuWallet /></span><span>{isPast ? "Saldo no fim do mês" : "Saldo previsto no fim do mês"}</span></div>
          <strong className={endBalance < 0 ? "neg" : ""}>{formatBRL(endBalance)}</strong>
          <div className="ct-sub"><span>{isPast ? "Saldo em conta no último dia" : "Saldo em conta + o que falta receber − o que falta pagar (inclui atrasados)"}</span></div>
        </div>
      </div>
      <p className="muted small">Gastos no cartão de crédito aparecem um a um, no dia da compra ou da cobrança. A fatura (a soma deles) não é contada de novo — ela fica na aba Cartões.</p>
    </div>
  );
}

/** Seletor compacto de mês (usado em Entradas e Saídas). */
export function MonthSelect({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const { y } = monthParts(month);
  const opts: string[] = [];
  for (let yy = y - 2; yy <= y + 2; yy++) for (let mm = 1; mm <= 12; mm++) opts.push(makeMonth(yy, mm));
  return (
    <div className="month-select">
      <button aria-label="Mês anterior" onClick={() => onChange(addMonths(month, -1))}><LuChevronLeft /></button>
      <select aria-label="Escolher mês" value={month} onChange={(e) => onChange(e.target.value)}>
        {opts.map((m) => { const { y: yy, m: mo } = monthParts(m); return <option key={m} value={m}>{MONTH_NAMES[mo - 1][0].toUpperCase() + MONTH_NAMES[mo - 1].slice(1)} {yy}</option>; })}
      </select>
      <button aria-label="Próximo mês" onClick={() => onChange(addMonths(month, 1))}><LuChevronRight /></button>
    </div>
  );
}

/** Troca de mês do calendário: setas, menu de meses e atalho para hoje. */
function CalMonthBar({ month, today, onChange }: { month: string; today: string; onChange: (m: string) => void }) {
  const cur = monthOf(today);
  const { y } = monthParts(month);
  const opts: string[] = [];
  for (let yy = y - 2; yy <= y + 2; yy++) for (let mm = 1; mm <= 12; mm++) opts.push(makeMonth(yy, mm));
  return (
    <div className="cal-monthbar">
      <Button size="sm" variant="ghost" icon={<LuChevronLeft />} onClick={() => onChange(addMonths(month, -1))}>{monthLabel(addMonths(month, -1)).split(" ")[0]}</Button>
      <select aria-label="Escolher mês" value={month} onChange={(e) => onChange(e.target.value)}>
        {opts.map((m) => { const { y: yy, m: mo } = monthParts(m); return <option key={m} value={m}>{MONTH_NAMES[mo - 1][0].toUpperCase() + MONTH_NAMES[mo - 1].slice(1)} {yy}</option>; })}
      </select>
      <Button size="sm" variant="ghost" onClick={() => onChange(addMonths(month, 1))}>{monthLabel(addMonths(month, 1)).split(" ")[0]} <LuChevronRight /></Button>
      {month !== cur && <Button size="sm" variant="soft" onClick={() => onChange(cur)}>Mês atual</Button>}
    </div>
  );
}
