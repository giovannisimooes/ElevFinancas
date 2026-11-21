import React, { useMemo, useState } from "react";
import { LuCalendarDays } from "./icons";
import { useApp } from "./state";
import { Empty, ItemActions, Amount, StatusBadge, cls } from "./components";
import { TypeIcon } from "./table";
import { matchesProfile, dueState } from "../core/engine";
import { monthParts, daysInMonth, weekday, pad, formatDateBR, monthLabel } from "../core/dates";
import { formatBRL } from "../core/money";
import type { Item } from "../core/types";

type Kind = "income" | "fixed" | "inst" | "overdue" | "paid" | "other";
function kindOf(it: Item, today: string): Kind {
  if (it.status === "paid") return "paid";
  if (it.type !== "income" && dueState(it, today) === "overdue") return "overdue";
  if (it.type === "income") return "income";
  if (it.source === "inst") return "inst";
  if (it.source === "rec") return "fixed";
  return "other";
}
const LABEL: Record<Kind, string> = { income: "Receitas previstas", fixed: "Contas fixas", inst: "Parcelamentos", overdue: "Atrasadas", paid: "Pagas/recebidas", other: "Outras contas e faturas" };

export function CalendarPage() {
  const { items, view, month, today } = useApp();
  const { y, m } = monthParts(month);
  const dim = daysInMonth(y, m);
  const first = weekday(`${month}-01`);
  const [sel, setSel] = useState<string | null>(month === today.slice(0, 7) ? today : null);
  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      if (!matchesProfile(it, view) || it.type === "transfer" || it.isCredit || it.pre) continue;
      if (!it.date.startsWith(month)) continue;
      (map.get(it.date) || map.set(it.date, []).get(it.date)!).push(it);
    }
    return map;
  }, [items, view, month]);
  const selected = sel && sel.startsWith(month) ? sel : null;
  const list = selected ? byDay.get(selected) || [] : [];
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: dim }, (_, i) => `${month}-${pad(i + 1)}`)];
  while (cells.length % 7) cells.push(null);
  return (
    <div className="page">
      <div className="page-head"><div><h2>Calendário financeiro</h2><p className="muted small">{monthLabel(month)} · clique num dia para ver e pagar as movimentações.</p></div></div>
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
    </div>
  );
}
