// Páginas "Entradas" e "Saídas": todos os valores que entram e todas as despesas que saem,
// separados, com resumo, filtros, ranking por categoria e a mesma tabela das outras páginas.
import React, { useMemo, useState } from "react";
import { LuSearch, LuPlus, LuTrendingUp, LuTrendingDown } from "./icons";
import { useApp } from "./state";
import { Button, Empty, Segmented, Select, cls } from "./components";
import { ItemTable } from "./table";
import { Panel } from "./dashboard";
import { HBars } from "./charts";
import { matchesProfile, CREDIT } from "../core/engine";
import { monthShort, monthLabel, monthOf, addMonths, lastDay } from "../core/dates";
import { formatBRL, formatPct } from "../core/money";
import type { Item } from "../core/types";

export function FlowPage({ kind }: { kind: "income" | "expense" }) {
  const { data, items, view, month, today, open } = useApp();
  const isIn = kind === "income";
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<"month" | "year" | "all">("month");
  const [status, setStatus] = useState("all");
  const [cat, setCat] = useState("");
  const [method, setMethod] = useState("");

  const base = useMemo(() => {
    const limit = lastDay(addMonths(monthOf(today), 3));
    return items.filter((i) => {
      if (i.type !== kind || i.pre || !matchesProfile(i, view)) return false;
      if (period === "month" && i.competence !== month) return false;
      if (period === "year" && i.competence.slice(0, 4) !== month.slice(0, 4)) return false;
      if (period === "all" && i.date > limit) return false;
      return true;
    });
  }, [items, kind, view, period, month, today]);

  const cats = useMemo(() => [...new Set(base.map((i) => i.category))].sort((a, b) => a.localeCompare(b, "pt-BR")), [base]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return base.filter((i) => {
      if (status === "paid" && i.status !== "paid") return false;
      if (status === "pending" && i.status !== "pending") return false;
      if (status === "overdue" && !(i.status === "pending" && !i.isCredit && i.date < today)) return false;
      if (cat && i.category !== cat) return false;
      if (method && i.method !== method) return false;
      if (s && !`${i.description} ${i.category} ${i.notes || ""} ${i.origin || ""}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [base, status, cat, method, q, today]);

  const sum = (l: Item[]) => l.reduce((t, i) => t + i.amountCents, 0);
  const total = sum(filtered);
  const done = sum(filtered.filter((i) => i.status === "paid"));
  const pending = sum(filtered.filter((i) => i.status === "pending"));
  const overdueList = filtered.filter((i) => i.status === "pending" && !i.isCredit && i.date < today);
  const credit = sum(filtered.filter((i) => i.method === CREDIT));

  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of filtered) m.set(i.category, (m.get(i.category) || 0) + i.amountCents);
    return [...m].map(([name, cents]) => ({ name, cents, sub: formatPct((cents / Math.max(1, total)) * 100) + " do total" })).sort((a, b) => b.cents - a.cents);
  }, [filtered, total]);
  const byOrigin = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of filtered) { const k = isIn ? (i.origin || i.description) : i.method === CREDIT && i.cardId && data.cards[i.cardId] ? `Crédito · ${data.cards[i.cardId].name}` : i.method; m.set(k, (m.get(k) || 0) + i.amountCents); }
    return [...m].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents);
  }, [filtered, isIn, data.cards]);

  const periodLabel = period === "month" ? monthLabel(month) : period === "year" ? `Ano ${month.slice(0, 4)}` : "Todo o período";
  const color = isIn ? data.settings.chartColors[0] : data.settings.chartColors[4] || "#EF4444";

  return (
    <div className="page">
      <div className="page-head">
        <div><h2>{isIn ? "Entradas" : "Saídas"}</h2><p className="muted small">{isIn ? "Todos os valores que entraram ou vão entrar para você — recebidos e a receber." : "Todas as suas despesas — pagas e a pagar, no débito e no crédito."} {periodLabel}.</p></div>
        <Button variant="primary" icon={<LuPlus />} onClick={() => open({ kind: "tx", txType: kind })}>{isIn ? "Nova entrada" : "Nova despesa"}</Button>
      </div>

      <div className="stat-chips">
        <div className="stat-chip static"><span>{isIn ? "Total de entradas" : "Total de saídas"}</span><strong className={isIn ? "pos" : "neg"}>{formatBRL(total)}</strong></div>
        <button className={cls("stat-chip", status === "paid" && "on", "t-ok")} onClick={() => setStatus(status === "paid" ? "all" : "paid")}><span>{isIn ? "Recebido" : "Pago"}</span><strong>{formatBRL(done)}</strong></button>
        <button className={cls("stat-chip", status === "pending" && "on")} onClick={() => setStatus(status === "pending" ? "all" : "pending")}><span>{isIn ? "A receber" : "A pagar"}</span><strong>{formatBRL(pending)}</strong></button>
        <button className={cls("stat-chip", status === "overdue" && "on", "t-danger")} onClick={() => setStatus(status === "overdue" ? "all" : "overdue")}><span>Atrasado</span><strong>{overdueList.length} · {formatBRL(sum(overdueList))}</strong></button>
        {!isIn && <div className="stat-chip static"><span>No crédito</span><strong>{formatBRL(credit)}</strong></div>}
        <div className="stat-chip static"><span>Lançamentos</span><strong>{filtered.length}</strong></div>
      </div>

      <div className="filters panel">
        <div className="search"><LuSearch /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={isIn ? "Buscar cliente, descrição, categoria…" : "Buscar gasto, categoria, observação…"} /></div>
        <Segmented size="sm" value={period} onChange={setPeriod} options={[{ value: "month", label: monthShort(month) }, { value: "year", label: month.slice(0, 4) }, { value: "all", label: "Tudo" }]} />
        <Select value={status} onChange={setStatus} options={[{ value: "all", label: "Todos os status" }, { value: "paid", label: isIn ? "Recebidos" : "Pagos" }, { value: "pending", label: isIn ? "A receber" : "A pagar" }, { value: "overdue", label: "Atrasados" }]} />
        <Select value={cat} onChange={setCat} placeholder="Todas as categorias" options={cats} />
        <Select value={method} onChange={setMethod} placeholder="Todas as formas" options={isIn ? data.settings.methods.filter((m) => m !== CREDIT) : data.settings.methods} />
      </div>

      <div className="grid-dash">
        <Panel title={isIn ? "Entradas por categoria" : "Saídas por categoria"} icon={isIn ? <LuTrendingUp /> : <LuTrendingDown />} className="span-6">
          <HBars rows={byCat} color={color} max={8} />
        </Panel>
        <Panel title={isIn ? "Entradas por cliente / origem" : "Saídas por forma de pagamento"} className="span-6">
          <HBars rows={byOrigin} color={color} max={8} />
        </Panel>
      </div>

      <section className="panel">
        <ItemTable items={filtered} pageSize={60} empty={<Empty icon={isIn ? <LuTrendingUp /> : <LuTrendingDown />} title={isIn ? "Nenhuma entrada encontrada" : "Nenhuma saída encontrada"} text="Ajuste os filtros ou registre um novo lançamento." action={<Button variant="soft" icon={<LuPlus />} onClick={() => open({ kind: "tx", txType: kind })}>{isIn ? "Nova entrada" : "Nova despesa"}</Button>} />} />
      </section>
    </div>
  );
}
