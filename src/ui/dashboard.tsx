import React, { useMemo, useState } from "react";
import { LuWallet, LuTrendingUp, LuTrendingDown, LuScale, LuTarget, LuPlus, LuCalendarDays, LuTriangleAlert, LuCreditCard, LuPiggyBank, LuReceipt, LuCheck } from "./icons";
import { useApp } from "./state";
import { Button, Empty, Progress, Amount, StatusBadge, cls, Segmented } from "./components";
import { BarChart, Donut } from "./charts";
import { ItemTable, TypeIcon } from "./table";
import { LayoutGrid, useBlockScale } from "./layout";
import { monthMetrics, byCategory, matchesProfile, goalProgress, isPayable, CREDIT, dueState } from "../core/engine";
import { addMonths, monthShort, monthLabel, formatDateShort, daysBetween, addDays, monthOf, formatDateBR, dateInMonth } from "../core/dates";
import { formatBRL, formatPct } from "../core/money";
import type { Item, Goal } from "../core/types";

export function Kpi({ icon, tone, label, value, children, foot }: { icon: React.ReactNode; tone: string; label: string; value: React.ReactNode; children?: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <div className={cls("kpi", `kpi-${tone}`)}>
      <div className="kpi-top"><span className="kpi-icon">{icon}</span><span className="kpi-label">{label}</span></div>
      <div className="kpi-value">{value}</div>
      {children && <div className="kpi-sub">{children}</div>}
      {foot && <div className="kpi-foot">{foot}</div>}
    </div>
  );
}

export function Panel({ title, icon, action, children, className }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cls("panel", className)}>
      <header className="panel-head">{icon && <span className="panel-icon">{icon}</span>}<h3>{title}</h3><span className="grow" />{action}</header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function Sub({ k, v, tone }: { k: string; v: React.ReactNode; tone?: string }) {
  return <div className="sub"><span>{k}</span><strong className={tone}>{v}</strong></div>;
}

export function Dashboard() {
  const { data, items, view, month, today, open } = useApp();
  const m = useMemo(() => monthMetrics(data, items, view, month, today), [data, items, view, month, today]);
  const prev = useMemo(() => monthMetrics(data, items, view, addMonths(month, -1), today), [data, items, view, month, today]);
  const colors = data.settings.chartColors;
  const isPast = month < monthOf(today);
  const isCurrent = month === monthOf(today);

  const goals = Object.values(data.goals).filter((g) => view === "geral" || g.profile === view);
  const reserved = goals.filter((g) => g.kind === "acumulo").reduce((s, g) => s + goalProgress(g).reserved, 0);
  const monthGoal: Goal | undefined = goals.find((g) => g.kind === "mensal") || goals.filter((g) => g.kind === "acumulo").sort((a, b) => (a.deadline || "9").localeCompare(b.deadline || "9"))[0];

  const months6 = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5));
  const series6 = months6.map((mk) => monthMetrics(data, items, view, mk, today));

  const expCat = byCategory(items, view, month, "expense");
  const incCat = byCategory(items, view, month, "income");

  const upcoming = useMemo(() => {
    const limit = addDays(today, 30);
    return items.filter((i) => matchesProfile(i, view) && i.status === "pending" && i.type !== "transfer" && !i.isCredit && i.date <= limit)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [items, view, today]);

  const empty = !Object.keys(data.txs).length && !Object.keys(data.recurring).length && !Object.keys(data.installments).length;

  return (
    <div className="page">
      {empty && (
        <div className="welcome">
          <div><h2>Bem-vindo ao ELEV FINANCE</h2><p className="muted">Seus dados começam vazios. Comece informando o saldo inicial e registre seus primeiros lançamentos.</p></div>
          <div className="row gap wrap">
            <Button onClick={() => open({ kind: "settings", tab: "financeiro" })}>Definir saldo inicial</Button>
            <Button variant="primary" icon={<LuPlus />} onClick={() => open({ kind: "new" })}>Primeiro lançamento</Button>
          </div>
        </div>
      )}
      <LayoutGrid
        blocks={{
    kpis: (
      <div className="kpis">
        <Kpi icon={<LuWallet />} tone="p" label={isPast ? `Saldo em ${monthShort(month)}` : "Saldo em conta"} value={formatBRL(isPast ? m.balanceEndOfMonth : m.balanceNow)}
          foot={<>{!isPast && <Sub k="Previsto no fim do mês" v={formatBRL(m.projectedEnd)} tone={m.projectedEnd < 0 ? "neg" : ""} />}{reserved > 0 && <Sub k="Reservado em metas" v={formatBRL(reserved)} />}</>}>
          <span className="muted small">{isPast ? "Saldo final do mês" : "Inicial + movimentações realizadas"}</span>
        </Kpi>
        <Kpi icon={<LuTrendingUp />} tone="pos" label="Receitas" value={formatBRL(m.incomeTotal)}
          foot={<><Sub k="Recebido" v={formatBRL(m.incomeReceived)} tone="pos" /><Sub k="A receber" v={formatBRL(m.incomePending)} /></>}>
          <Progress value={m.incomeTotal ? (m.incomeReceived / m.incomeTotal) * 100 : 0} tone="ok" />
        </Kpi>
        <Kpi icon={<LuTrendingDown />} tone="neg" label="Despesas" value={formatBRL(m.expenseTotal)}
          foot={<><Sub k="Pago" v={formatBRL(m.expensePaid)} /><Sub k="Pendente" v={formatBRL(m.expensePending)} tone={m.expensePending ? "neg" : ""} /></>}>
          <Progress value={m.expenseTotal ? (m.expensePaid / m.expenseTotal) * 100 : 0} tone="danger" />
        </Kpi>
        <Kpi icon={<LuScale />} tone={m.resultRealized >= 0 ? "pos" : "neg"} label="Resultado do mês" value={<span className={m.resultRealized < 0 ? "neg" : ""}>{formatBRL(m.resultRealized)}</span>}
          foot={<><Sub k="Realizado" v={formatBRL(m.resultRealized)} /><Sub k="Previsto" v={formatBRL(m.resultForecast)} tone={m.resultForecast < 0 ? "neg" : "pos"} /></>}>
          <span className="muted small">Recebido − pago</span>
        </Kpi>
        <GoalKpi goal={monthGoal} resultOf={(g) => monthMetrics(data, items, g.profile, month, today).resultRealized} />
      </div>
    ),
    revexp: (
        <Panel title="Receitas x Despesas" icon={<LuReceipt />} action={<span className="muted small">últimos 6 meses</span>}>
          <BarChart labels={months6.map(monthShort)} series={[
            { name: "Receitas", color: colors[0], values: series6.map((s) => s.incomeTotal) },
            { name: "Despesas", color: colors[4] || "#EF4444", values: series6.map((s) => s.expenseTotal) },
          ]} />
        </Panel>
    ),
    expcat: (
        <Panel title="Despesas por categoria" action={<span className="muted small">{monthLabel(month)}</span>}>
          <Donut data={expCat} colors={colors} emptyText="Nenhuma despesa neste mês" />
        </Panel>
    ),
    compare: (
        <Panel title="Comparativo mensal" action={<span className="muted small">{monthShort(addMonths(month, -1))} x {monthShort(month)}</span>}>
          <BarChart height={200} signed labels={["Receitas", "Despesas", "Resultado"]} series={[
            { name: monthShort(addMonths(month, -1)), color: "var(--muted-bar)", values: [prev.incomeTotal, prev.expenseTotal, prev.resultForecast] },
            { name: monthShort(month), color: colors[0], values: [m.incomeTotal, m.expenseTotal, m.resultForecast] },
          ]} />
          <CompareLine a={prev.expenseTotal} b={m.expenseTotal} label="Despesas" invert />
        </Panel>
    ),
    inccat: (
        <Panel title="Receitas por categoria">
          <Donut data={incCat} colors={[colors[0], ...colors.slice(1)]} emptyText="Nenhuma receita neste mês" size={140} />
        </Panel>
    ),
    upcoming: (
        <Panel title="Próximos vencimentos" icon={<LuCalendarDays />} action={<button className="link small" onClick={() => { location.hash = "#calendario"; }}>Calendário</button>}>
          <Upcoming list={upcoming} />
        </Panel>
    ),
    tabs: <BottomTabs />,
        }}
        after={{ kpis: m.overdueCount > 0 ? <div className="block span-12"><div className="alert" role="alert"><LuTriangleAlert /> <span><b>{m.overdueCount} {m.overdueCount === 1 ? "conta atrasada" : "contas atrasadas"}</b> somando {formatBRL(m.overdueCents)}.</span>
          <button className="link" onClick={() => { location.hash = "#calendario"; }}>Ver no calendário</button></div></div> : null }}
      />
    </div>
  );
}

function CompareLine({ a, b, label, invert }: { a: number; b: number; label: string; invert?: boolean }) {
  if (!a) return null;
  const d = ((b - a) / a) * 100;
  const good = invert ? d <= 0 : d >= 0;
  return <p className="small muted center">{label} {d >= 0 ? "subiram" : "caíram"} <b className={good ? "pos" : "neg"}>{formatPct(Math.abs(d))}</b> em relação ao mês anterior</p>;
}

function GoalKpi({ goal, resultOf }: { goal?: Goal; resultOf: (g: Goal) => number }) {
  const { open } = useApp();
  if (!goal) return (
    <Kpi icon={<LuTarget />} tone="info" label="Meta do mês" value={<span className="muted">—</span>} foot={<Button size="sm" variant="soft" icon={<LuPlus />} onClick={() => open({ kind: "goal" })}>Criar meta</Button>}>
      <span className="muted small">Nenhuma meta cadastrada</span>
    </Kpi>
  );
  const pr = goalProgress(goal, goal.kind === "mensal" ? resultOf(goal) : undefined);
  return (
    <Kpi icon={<LuTarget />} tone="info" label="Meta do mês" value={formatBRL(goal.targetCents)}
      foot={<><Sub k={goal.kind === "mensal" ? "Resultado atual" : "Reservado"} v={formatBRL(pr.current)} /><Sub k="Falta" v={formatBRL(pr.missing)} /></>}>
      <div className="row between small"><span className="ellipsis">{goal.name}</span><b>{formatPct(pr.progress, 0)}</b></div>
      <Progress value={pr.progress} />
    </Kpi>
  );
}

function Upcoming({ list }: { list: Item[] }) {
  const { open, today } = useApp();
  const max = Math.max(3, Math.round(7 * useBlockScale()));
  if (!list.length) return <Empty icon={<LuCheck />} title="Nada vencendo" text="Sem contas pendentes nos próximos 30 dias." />;
  return (
    <ul className="upcoming">
      {list.slice(0, max).map((it) => {
        const st = dueState(it, today);
        const days = daysBetween(today, it.date);
        return (
          <li key={it.key} className={cls(st === "overdue" && "overdue")} onClick={() => open({ kind: "details", item: it })}>
            <div className="up-date"><strong>{formatDateShort(it.date).slice(0, 2)}</strong><span>{formatDateShort(it.date).slice(3)}</span></div>
            <div className="grow minw0">
              <div className="ellipsis">{it.description}</div>
              <div className="small muted">{st === "overdue" ? <span className="neg">Atrasado há {-days} {-days === 1 ? "dia" : "dias"}</span> : days === 0 ? "Vence hoje" : `Em ${days} ${days === 1 ? "dia" : "dias"}`}{it.installmentNo ? " · parcela" : it.source === "rec" ? " · fixa" : it.type === "invoice" ? " · fatura" : ""}</div>
            </div>
            <div className="right"><Amount item={it} /><button className="link small" onClick={(e) => { e.stopPropagation(); open({ kind: "pay", item: it }); }}>{it.type === "income" ? "Receber" : "Pagar"}</button></div>
          </li>
        );
      })}
      {list.length > max && <li className="muted small center">+ {list.length - max} vencimentos</li>}
    </ul>
  );
}

function BottomTabs() {
  const { data, items, view, month, open } = useApp();
  const [tab, setTab] = useState<"in" | "deb" | "cred" | "goals">("in");
  const inMonth = items.filter((i) => matchesProfile(i, view) && i.competence === month);
  const incomes = inMonth.filter((i) => i.type === "income");
  const debit = inMonth.filter((i) => i.type === "expense" && i.method !== CREDIT);
  const credit = inMonth.filter((i) => i.type === "expense" && i.method === CREDIT);
  const invoices = inMonth.filter((i) => i.type === "invoice");
  const sum = (l: Item[]) => l.reduce((s, i) => s + i.amountCents, 0);
  return (
    <section className="panel tabs-panel">
      <div className="tabs-head">
        <Segmented value={tab} onChange={setTab} options={[
          { value: "in", label: <>Entradas <span className="count">{incomes.length}</span></> },
          { value: "deb", label: <>Despesas no débito <span className="count">{debit.length}</span></> },
          { value: "cred", label: <>Despesas no crédito <span className="count">{credit.length}</span></> },
          { value: "goals", label: <>Metas <span className="count">{Object.keys(data.goals).length}</span></> },
        ]} />
        <span className="grow" />
        {tab !== "goals" && <span className="muted small">Total: <b>{formatBRL(sum(tab === "in" ? incomes : tab === "deb" ? debit : credit))}</b></span>}
        <Button size="sm" variant="soft" icon={<LuPlus />} onClick={() => open(tab === "in" ? { kind: "tx", txType: "income" } : tab === "goals" ? { kind: "goal" } : { kind: "tx", txType: "expense", preset: tab === "cred" ? { method: CREDIT } : undefined })}>Adicionar</Button>
      </div>
      <div className="fade-in" key={tab}>
        {tab === "in" && <ItemTable items={incomes} compactCols empty={<Empty icon={<LuTrendingUp />} title="Nenhuma entrada neste mês" text="Registre receitas recebidas ou a receber." />} />}
        {tab === "deb" && <ItemTable items={debit} compactCols empty={<Empty icon={<LuTrendingDown />} title="Nenhuma despesa no débito" text="Pix, débito, dinheiro e boletos aparecem aqui." />} />}
        {tab === "cred" && <>
          {invoices.length > 0 && <div className="invoice-strip">{invoices.map((inv) => (
            <div key={inv.key} className="invoice-chip" onClick={() => open({ kind: "details", item: inv })}>
              <LuCreditCard /><div className="grow"><strong>{inv.description}</strong><span className="small muted">vence {formatDateBR(inv.date)}</span></div>
              <strong>{formatBRL(inv.amountCents)}</strong><StatusBadge item={inv} />
              {inv.status === "pending" && <Button size="xs" variant="soft" onClick={(e) => { e.stopPropagation(); open({ kind: "pay", item: inv }); }}>Pagar</Button>}
            </div>
          ))}</div>}
          <ItemTable items={credit} compactCols empty={<Empty icon={<LuCreditCard />} title="Nenhuma despesa no crédito" text="Compras no cartão entram pela competência da fatura." />} />
        </>}
        {tab === "goals" && <GoalsGrid />}
      </div>
    </section>
  );
}

export function GoalsGrid() {
  const { data, items, view, month, today, open } = useApp();
  const goals = Object.values(data.goals).filter((g) => view === "geral" || g.profile === view);
  if (!goals.length) return <Empty icon={<LuTarget />} title="Nenhuma meta" text="Crie uma reserva ou uma meta de resultado mensal." action={<Button variant="soft" icon={<LuPlus />} onClick={() => open({ kind: "goal" })}>Nova meta</Button>} />;
  return (
    <div className="goals-grid">
      {goals.map((g) => {
        const res = g.kind === "mensal" ? monthMetrics(data, items, g.profile, month, today).resultRealized : undefined;
        const pr = goalProgress(g, res);
        return (
          <div key={g.id} className="goal-card">
            <div className="row between"><strong className="ellipsis">{g.name}</strong><span className="muted small">{g.kind === "mensal" ? `Resultado de ${monthShort(month)}` : g.deadline ? `até ${formatDateBR(g.deadline)}` : "sem prazo"}</span></div>
            <div className="goal-nums"><span>{formatBRL(pr.current)}</span><span className="muted">de {formatBRL(g.targetCents)}</span></div>
            <Progress value={pr.progress} tone={pr.progress >= 100 ? "ok" : undefined} />
            <div className="row between small"><span>{formatPct(pr.progress)}</span>{g.kind === "acumulo" && pr.planned > 0 && <span className="muted">+ {formatBRL(pr.planned)} planejado</span>}</div>
            <div className="row gap">
              {g.kind === "acumulo" && <Button size="xs" variant="soft" icon={<LuPiggyBank />} onClick={() => open({ kind: "goalEntry", goalId: g.id })}>Adicionar valor</Button>}
              <Button size="xs" variant="ghost" onClick={() => open({ kind: "goal", id: g.id })}>Editar</Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { isPayable, dateInMonth };
