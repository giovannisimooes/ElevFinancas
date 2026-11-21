import React, { useMemo, useState } from "react";
import { LuDownload, LuFileText, LuChartBar, LuCopy } from "./icons";
import { useApp } from "./state";
import { Button, Segmented, Select, cls, Empty } from "./components";
import { Panel } from "./dashboard";
import { BarChart, LineChart, Donut, HBars } from "./charts";
import { monthMetrics, monthRange, matchesProfile, planSummary, isPayable } from "../core/engine";
import { addMonths, monthOf, monthShort, monthLabel, formatDateBR, lastDay } from "../core/dates";
import { formatBRL, formatPct } from "../core/money";
import { PROFILE_LABEL, type ProfileView, type Item } from "../core/types";
import { toCSV, buildPDF } from "../core/exporters";
import { saveFile } from "./download";

export function ReportsPage() {
  const { data, items, view: gview, month, today, minMonth, toast } = useApp();
  const cur = monthOf(today);
  const [from, setFrom] = useState(addMonths(month, -5));
  const [to, setTo] = useState(month);
  const [view, setView] = useState<ProfileView>(gview);
  const [cat, setCat] = useState("");
  const [fallback, setFallback] = useState<string | null>(null);
  const colors = data.settings.chartColors;

  const monthOpts = monthRange(minMonth < addMonths(cur, -36) ? minMonth : addMonths(cur, -36), addMonths(cur, 12)).map((m) => ({ value: m, label: monthLabel(m) }));
  const months = from <= to ? monthRange(from, to) : monthRange(to, from);
  const mset = new Set(months);
  const metrics = useMemo(() => months.map((mk) => ({ mk, ...monthMetrics(data, items, view, mk, today) })), [data, items, view, from, to, today]);
  const inPeriod = useMemo(() => items.filter((i) => matchesProfile(i, view) && mset.has(i.competence) && i.type !== "transfer" && !i.pre && (!cat || i.category === cat)), [items, view, from, to, cat]);
  const expenseCats = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of inPeriod) if (i.type === "expense") m.set(i.category, (m.get(i.category) || 0) + i.amountCents);
    return [...m].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents);
  }, [inPeriod]);
  const incomeCats = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of inPeriod) if (i.type === "income") m.set(i.category, (m.get(i.category) || 0) + i.amountCents);
    return [...m].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents);
  }, [inPeriod]);
  const exp = inPeriod.filter((i) => i.type === "expense");
  const fixed = exp.filter((i) => i.fixed).reduce((s, i) => s + i.amountCents, 0);
  const variable = exp.filter((i) => !i.fixed).reduce((s, i) => s + i.amountCents, 0);
  const payables = inPeriod.filter((i) => i.type === "expense");
  const paidV = payables.filter((i) => i.status === "paid").reduce((s, i) => s + i.amountCents, 0);
  const pendV = payables.filter((i) => i.status !== "paid").reduce((s, i) => s + i.amountCents, 0);
  const balances = metrics.map((x) => (x.mk < cur ? x.balanceEndOfMonth : x.mk === cur ? x.projectedEnd : x.projectedEnd));
  const dashedFrom = months.indexOf(cur) >= 0 ? months.indexOf(cur) : months[0] > cur ? 0 : undefined;

  const flowMonths = monthRange(cur, addMonths(cur, 5));
  const flow = flowMonths.map((mk) => {
    let inn = 0, out = 0;
    for (const i of items) {
      if (!matchesProfile(i, view) || i.status !== "pending" || monthOf(i.date) !== mk) continue;
      if (i.type === "income") inn += i.amountCents; else if (isPayable(i)) out += i.amountCents;
    }
    return { mk, inn, out, bal: monthMetrics(data, items, view, mk, today).projectedEnd };
  });

  const plans = Object.values(data.installments).filter((p) => matchesProfile(p, view)).map((p) => ({ p, s: planSummary(items, p, to) })).filter(({ s }) => s.remainingCount > 0);
  const allCats = [...new Set(items.filter((i) => i.type === "expense" || i.type === "income").map((i) => i.category))].sort();

  const tot = metrics.reduce((a, x) => ({ inc: a.inc + x.incomeTotal, exp: a.exp + x.expenseTotal, res: a.res + x.resultForecast }), { inc: 0, exp: 0, res: 0 });
  const periodLabel = `${monthLabel(months[0])} a ${monthLabel(months[months.length - 1])}`;
  const fileBase = `elev-finance-${view}-${months[0]}_${months[months.length - 1]}`;

  const exportCSV = async () => {
    const rows = [["Data", "Descrição", "Tipo", "Categoria", "Valor (R$)", "Forma", "Status", "Data efetiva", "Competência", "Perfil", "Observações"],
      ...[...inPeriod].sort((a, b) => a.date.localeCompare(b.date)).map((i) => [formatDateBR(i.date), i.description, i.type === "income" ? "Entrada" : i.type === "invoice" ? "Pagamento de fatura" : "Despesa", i.category, ((i.type === "income" ? 1 : -1) * i.amountCents / 100).toFixed(2).replace(".", ","), i.method, i.status === "paid" ? "Pago" : "Pendente", i.paidDate ? formatDateBR(i.paidDate) : "", monthLabel(i.competence), PROFILE_LABEL[i.profile], i.notes || ""])];
    const csv = toCSV(rows);
    const r = await saveFile(fileBase + ".csv", csv);
    if (r.ok) toast("CSV exportado"); else if (r.reason === "unavailable") setFallback(csv); else toast(r.message, "err");
  };
  const exportSummaryCSV = async () => {
    const rows = [["Mês", "Receitas", "Recebido", "Despesas", "Pago", "Resultado previsto", "Resultado realizado", "Saldo final/projetado"],
      ...metrics.map((x, i) => [monthLabel(x.mk), x.incomeTotal, x.incomeReceived, x.expenseTotal, x.expensePaid, x.resultForecast, x.resultRealized, balances[i]].map((v, j) => j === 0 ? v : (Number(v) / 100).toFixed(2).replace(".", ",")))];
    const csv = toCSV(rows as (string | number)[][]);
    const r = await saveFile(fileBase + "-resumo.csv", csv);
    if (r.ok) toast("CSV exportado"); else if (r.reason === "unavailable") setFallback(csv); else toast(r.message, "err");
  };
  const exportPDF = async () => {
    const pdf = buildPDF({
      title: "ELEV FINANCE — Relatório financeiro", subtitle: `${periodLabel} · ${PROFILE_LABEL[view]}${cat ? ` · ${cat}` : ""} · gerado em ${formatDateBR(today)}`, color: data.settings.primary,
      summary: [["Receitas no período", formatBRL(tot.inc)], ["Despesas no período", formatBRL(tot.exp)], ["Resultado previsto", formatBRL(tot.res)], ["Saldo atual", formatBRL(monthMetrics(data, items, view, cur, today).balanceNow)], ["Despesas fixas", formatBRL(fixed)], ["Despesas variáveis", formatBRL(variable)]],
      tables: [
        { heading: "Resumo mensal", columns: ["Mês", "Receitas", "Despesas", "Resultado", "Saldo"], widths: [2, 1.4, 1.4, 1.4, 1.4], align: ["l", "r", "r", "r", "r"], rows: metrics.map((x, i) => [monthLabel(x.mk), formatBRL(x.incomeTotal), formatBRL(x.expenseTotal), formatBRL(x.resultForecast), formatBRL(balances[i])]) },
        { heading: "Gastos por categoria", columns: ["Categoria", "Valor", "%"], widths: [3, 1.4, 0.8], align: ["l", "r", "r"], rows: expenseCats.map((c) => [c.name, formatBRL(c.cents), formatPct((c.cents / Math.max(1, tot.exp)) * 100)]) },
        { heading: "Parcelamentos restantes", columns: ["Compra", "Parcelas", "Saldo devedor", "Quitação"], widths: [3, 1, 1.4, 1.2], align: ["l", "r", "r", "r"], rows: plans.map(({ p, s }) => [p.description, `${s.paidCount}/${p.total}`, formatBRL(s.remainingCents), formatDateBR(s.payoffDate)]) },
        { heading: "Lançamentos do período", columns: ["Data", "Descrição", "Categoria", "Status", "Valor"], widths: [1, 3, 1.8, 1, 1.3], align: ["l", "l", "l", "l", "r"], rows: [...inPeriod].sort((a, b) => a.date.localeCompare(b.date)).map((i) => [formatDateBR(i.date), i.description, i.category, i.status === "paid" ? "Pago" : "Pendente", (i.type === "income" ? "+" : "-") + formatBRL(i.amountCents)]) },
      ],
    });
    const r = await saveFile(fileBase + ".pdf", pdf);
    if (r.ok) toast("PDF exportado"); else toast(r.reason === "unavailable" ? "Download de PDF indisponível nesta visualização" : r.message, "err");
  };

  return (
    <div className="page">
      <div className="page-head"><div><h2>Relatórios</h2><p className="muted small">{periodLabel} · {PROFILE_LABEL[view]}</p></div>
        <div className="row gap wrap">
          <Button icon={<LuDownload />} onClick={exportCSV}>CSV lançamentos</Button>
          <Button icon={<LuDownload />} onClick={exportSummaryCSV}>CSV resumo</Button>
          <Button variant="primary" icon={<LuFileText />} onClick={exportPDF}>Exportar PDF</Button>
        </div></div>
      <div className="filters panel">
        <label className="inline">De <Select value={from} onChange={setFrom} options={monthOpts} /></label>
        <label className="inline">Até <Select value={to} onChange={setTo} options={monthOpts} /></label>
        <Segmented size="sm" value={view} onChange={setView} options={[{ value: "pessoal", label: "Pessoal" }, { value: "elev", label: "ELEV" }, { value: "geral", label: "Geral" }]} />
        <Select value={cat} onChange={setCat} placeholder="Todas as categorias" options={allCats} />
        <div className="row gap">{[3, 6, 12].map((n) => <Button key={n} size="xs" variant="ghost" onClick={() => { setFrom(addMonths(month, -(n - 1))); setTo(month); }}>{n} meses</Button>)}<Button size="xs" variant="ghost" onClick={() => { setFrom(`${month.slice(0, 4)}-01`); setTo(`${month.slice(0, 4)}-12`); }}>Ano {month.slice(0, 4)}</Button></div>
      </div>
      {fallback && <div className="fallback panel"><p className="small">Download indisponível nesta visualização. Copie o conteúdo e salve como <code>.csv</code>:</p><textarea readOnly rows={5} value={fallback} /><div className="row gap"><Button size="sm" icon={<LuCopy />} onClick={() => navigator.clipboard.writeText(fallback).then(() => toast("Copiado"), () => toast("Não foi possível copiar", "err"))}>Copiar</Button><Button size="sm" variant="ghost" onClick={() => setFallback(null)}>Fechar</Button></div></div>}

      <div className="stat-chips">
        <div className="stat-chip static"><span>Receitas</span><strong className="pos">{formatBRL(tot.inc)}</strong></div>
        <div className="stat-chip static"><span>Despesas</span><strong className="neg">{formatBRL(tot.exp)}</strong></div>
        <div className="stat-chip static"><span>Resultado</span><strong className={tot.res < 0 ? "neg" : "pos"}>{formatBRL(tot.res)}</strong></div>
        <div className="stat-chip static"><span>Média de despesas/mês</span><strong>{formatBRL(Math.round(tot.exp / months.length))}</strong></div>
      </div>

      <div className="grid-dash">
        <Panel title="Receitas e despesas por mês" icon={<LuChartBar />} className="span-6">
          <BarChart labels={months.map(monthShort)} series={[{ name: "Receitas", color: colors[0], values: metrics.map((x) => x.incomeTotal) }, { name: "Despesas", color: colors[4] || "#EF4444", values: metrics.map((x) => x.expenseTotal) }]} />
        </Panel>
        <Panel title="Resultado financeiro mensal" className="span-6">
          <BarChart signed labels={months.map(monthShort)} series={[{ name: "Resultado", color: colors[0], values: metrics.map((x) => x.resultForecast) }]} />
        </Panel>
        <Panel title="Evolução do saldo" className="span-6" action={<span className="small muted">tracejado = projeção</span>}>
          <LineChart labels={months.map(monthShort)} series={[{ name: "Saldo", color: colors[1], values: balances }]} dashedFrom={dashedFrom} />
        </Panel>
        <Panel title="Fluxo de caixa previsto (próximos 6 meses)" className="span-6">
          <BarChart labels={flowMonths.map(monthShort)} series={[{ name: "Entradas previstas", color: colors[0], values: flow.map((f) => f.inn) }, { name: "Saídas previstas", color: colors[4] || "#EF4444", values: flow.map((f) => f.out) }]} height={180} />
          <div className="flow-bal">{flow.map((f) => <div key={f.mk}><span className="muted small">{monthShort(f.mk)}</span><b className={f.bal < 0 ? "neg" : ""}>{formatBRL(f.bal)}</b></div>)}</div>
        </Panel>
        <Panel title="Gastos por categoria" className="span-6"><HBars rows={expenseCats.map((c) => ({ ...c, sub: formatPct((c.cents / Math.max(1, tot.exp)) * 100) + " do total" }))} color={colors[4] || "#EF4444"} max={10} /></Panel>
        <Panel title="Receitas por categoria" className="span-6"><HBars rows={incomeCats} color={colors[0]} max={10} /></Panel>
        <Panel title="Despesas fixas x variáveis" className="span-4"><Donut data={[{ name: "Fixas (recorrentes)", cents: fixed }, { name: "Variáveis", cents: variable }]} colors={[colors[3], colors[2]]} size={140} /></Panel>
        <Panel title="Contas pagas x pendentes" className="span-4"><Donut data={[{ name: "Pagas", cents: paidV }, { name: "Pendentes", cents: pendV }]} colors={[colors[0], "#94A3B8"]} size={140} /></Panel>
        <Panel title="Parcelamentos restantes" className="span-4">
          {!plans.length ? <Empty title="Nenhum parcelamento em aberto" /> : <ul className="mini-list">{plans.map(({ p, s }) => <li key={p.id}><span className="grow ellipsis">{p.description}</span><span className="muted small">{s.remainingCount}x · até {formatDateBR(s.payoffDate)}</span><strong>{formatBRL(s.remainingCents)}</strong></li>)}</ul>}
        </Panel>
      </div>

      <Panel title="Comparativo entre meses">
        <div className="table-wrap"><table className="table compare">
          <thead><tr><th>Mês</th><th className="right">Receitas</th><th className="right">Despesas</th><th className="right">Resultado</th><th className="right hide-md">Variação despesas</th><th className="right">Saldo final</th></tr></thead>
          <tbody>{metrics.map((x, i) => {
            const prev = i ? metrics[i - 1].expenseTotal : 0;
            const v = prev ? ((x.expenseTotal - prev) / prev) * 100 : null;
            return <tr key={x.mk}><td>{monthLabel(x.mk)}{x.mk > cur && <span className="mini-tag">previsto</span>}</td><td className="right pos">{formatBRL(x.incomeTotal)}</td><td className="right neg">{formatBRL(x.expenseTotal)}</td>
              <td className={cls("right", x.resultForecast < 0 ? "neg" : "pos")}><b>{formatBRL(x.resultForecast)}</b></td>
              <td className={cls("right hide-md", v != null && (v > 0 ? "neg" : "pos"))}>{v == null ? "—" : `${v > 0 ? "+" : ""}${formatPct(v)}`}</td><td className="right">{formatBRL(balances[i])}</td></tr>;
          })}</tbody>
        </table></div>
      </Panel>
      {void lastDay}
    </div>
  );
}
