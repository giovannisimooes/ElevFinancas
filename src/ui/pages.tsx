import React, { useMemo, useState } from "react";
import { LuSearch, LuPlus, LuRepeat, LuLayers, LuCreditCard, LuTarget, LuCheck, LuUndo2, LuPencil, LuTrash2, LuChevronDown, LuChevronRight, LuPiggyBank, LuListOrdered, LuEye } from "./icons";
import { useApp, ops } from "./state";
import { Button, Empty, Progress, Segmented, Select, StatusBadge, Amount, cls, KV, ProfileTag } from "./components";
import { ItemTable, statusRank } from "./table";
import { useListSort, sortList } from "./sort";
import { Panel, GoalsGrid } from "./dashboard";
import { matchesProfile, dueState, planSummary, valueAt, goalProgress, CREDIT, monthMetrics } from "../core/engine";
import { addMonths, monthOf, monthLabel, formatDateBR, lastDay, dateInMonth, monthShort, todayISO } from "../core/dates";
import { formatBRL, formatPct } from "../core/money";
import type { Item } from "../core/types";
import { PROFILE_LABEL } from "../core/types";

// ---------------- Lançamentos (histórico completo) ----------------
export function HistoryPage() {
  const { data, items, view, month, today, open } = useApp();
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<"month" | "year" | "all">("month");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [cat, setCat] = useState("");
  const [method, setMethod] = useState("");
  const cats = useMemo(() => [...new Set(items.map((i) => i.category))].sort((a, b) => a.localeCompare(b, "pt-BR")), [items]);
  const filtered = useMemo(() => {
    const limit = lastDay(addMonths(monthOf(today), 3));
    const s = q.trim().toLowerCase();
    return items.filter((i) => {
      if (!matchesProfile(i, view)) return false;
      if (i.pre) return false;
      if (period === "month" && i.competence !== month && monthOf(i.date) !== month) return false;
      if (period === "year" && i.date.slice(0, 4) !== month.slice(0, 4)) return false;
      if (period === "all" && i.date > limit) return false;
      if (type !== "all" && i.type !== type) return false;
      if (status === "paid" && i.status !== "paid") return false;
      if (status === "pending" && i.status !== "pending") return false;
      if (status === "overdue" && !(i.status === "pending" && !i.isCredit && i.date < today)) return false;
      if (cat && i.category !== cat) return false;
      if (method && i.method !== method) return false;
      if (s && !(`${i.description} ${i.category} ${i.notes || ""} ${i.origin || ""}`.toLowerCase().includes(s))) return false;
      return true;
    });
  }, [items, view, period, month, type, status, cat, method, q, today]);
  const tin = filtered.filter((i) => i.type === "income").reduce((s, i) => s + i.amountCents, 0);
  const tout = filtered.filter((i) => i.type === "expense").reduce((s, i) => s + i.amountCents, 0);
  return (
    <div className="page">
      <div className="page-head"><div><h2>Lançamentos</h2><p className="muted small">Histórico completo, com filtros, busca e ordenação. Clique numa linha para ver os detalhes.</p></div>
        <Button variant="primary" icon={<LuPlus />} onClick={() => open({ kind: "new" })}>Novo lançamento</Button></div>
      <div className="filters panel">
        <div className="search"><LuSearch /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar descrição, categoria, observação…" /></div>
        <Segmented size="sm" value={period} onChange={setPeriod} options={[{ value: "month", label: monthShort(month) }, { value: "year", label: month.slice(0, 4) }, { value: "all", label: "Tudo" }]} />
        <Select value={type} onChange={setType} options={[{ value: "all", label: "Todos os tipos" }, { value: "income", label: "Entradas" }, { value: "expense", label: "Despesas" }, { value: "invoice", label: "Faturas" }, { value: "transfer", label: "Transferências" }]} />
        <Select value={status} onChange={setStatus} options={[{ value: "all", label: "Todos os status" }, { value: "paid", label: "Pagos/recebidos" }, { value: "pending", label: "Pendentes" }, { value: "overdue", label: "Atrasados" }]} />
        <Select value={cat} onChange={setCat} placeholder="Todas as categorias" options={cats} />
        <Select value={method} onChange={setMethod} placeholder="Todas as formas" options={[...data.settings.methods, "Fatura"]} />
      </div>
      <div className="row gap wrap summary-line">
        <span>{filtered.length} lançamentos</span><span>Entradas: <b className="pos">{formatBRL(tin)}</b></span><span>Despesas: <b className="neg">{formatBRL(tout)}</b></span>
        <span className="muted small">Compras no crédito entram pela competência da fatura; faturas são só a saída de caixa.</span>
      </div>
      <section className="panel"><ItemTable items={filtered} pageSize={60} empty={<Empty icon={<LuListOrdered />} title="Nada encontrado" text="Ajuste os filtros ou registre um novo lançamento." />} /></section>
    </div>
  );
}

// ---------------- Contas fixas / recorrentes ----------------
export function RecurringPage() {
  const { data, items, view, month, today, open, update, toast } = useApp();
  const [filter, setFilter] = useState<"all" | "paid" | "pending" | "overdue" | "soon">("all");
  const recs = Object.values(data.recurring).filter((r) => matchesProfile(r, view)).sort((a, b) => a.kind.localeCompare(b.kind) || a.dueDay - b.dueDay);
  const occOf = (id: string) => items.find((i) => i.source === "rec" && i.refId === id && i.occ === month);
  const ls = useListSort();
  const occs = sortList(recs.map((r) => ({ r, it: occOf(r.id) })), ls, {
    date: (o) => o.it?.date || String(o.r.dueDay).padStart(2, "0"), alpha: (o) => o.r.description, amount: (o) => o.it?.amountCents ?? valueAt(o.r, month),
    category: (o) => o.r.category, type: (o) => (o.r.kind === "income" ? 0 : 1), status: (o) => (o.it ? statusRank(o.it, today) : 4),
  });
  const count = (st: string) => occs.filter(({ it }) => it && it.type === "expense" && (st === "pending" ? it.status === "pending" : dueState(it, today) === st)).length;
  const shown = occs.filter(({ it }) => filter === "all" || (it && (filter === "pending" ? it.status === "pending" : dueState(it, today) === filter)));
  const totalMonth = occs.filter(({ it }) => it?.type === "expense").reduce((s, { it }) => s + (it?.amountCents || 0), 0);
  return (
    <div className="page">
      <div className="page-head"><div><h2>Contas fixas e recorrentes</h2><p className="muted small">Vencimentos gerados automaticamente. Cada mês tem seu próprio status — pagar um mês não paga os seguintes.</p></div>
        <Button variant="primary" icon={<LuPlus />} onClick={() => open({ kind: "recurring" })}>Nova conta recorrente</Button></div>
      <div className="stat-chips">
        {[["all", "Todas", recs.length, ""], ["paid", "Pagas", count("paid"), "ok"], ["pending", "Pendentes", count("pending"), ""], ["overdue", "Atrasadas", count("overdue"), "danger"], ["soon", "Próximas do vencimento", count("soon"), "warn"]].map(([k, l, n, t]) => (
          <button key={k as string} className={cls("stat-chip", filter === k && "on", t && `t-${t}`)} onClick={() => setFilter(k as typeof filter)}><span>{l}</span><strong>{n as number}</strong></button>
        ))}
        <div className="stat-chip static"><span>Total de fixas em {monthShort(month)}</span><strong>{formatBRL(totalMonth)}</strong></div>
      </div>
      {!recs.length ? <section className="panel"><Empty icon={<LuRepeat />} title="Nenhuma conta recorrente" text="Cadastre aluguel, energia, internet, assinaturas (ChatGPT, Claude, Canva, Spotify)…" action={<Button variant="soft" icon={<LuPlus />} onClick={() => open({ kind: "recurring" })}>Cadastrar</Button>} /></section> : (
        <section className="panel">
          <div className="table-wrap"><table className="table cards-sm">
            <thead><tr><th>Conta</th><th>Dia</th><th className="right">Valor em {monthShort(month)}</th><th className="hide-md">Forma</th><th className="hide-md">Perfil</th><th>Status do mês</th><th className="right">Ações</th></tr></thead>
            <tbody>{shown.map(({ r, it }) => (
              <tr key={r.id} onClick={() => it && open({ kind: "details", item: it })}>
                <td data-l="Conta" className="c-desc"><div className="desc"><span className={cls("ticon", r.kind === "income" ? "pos" : "neg")}><LuRepeat /></span><div className="minw0"><div className="ellipsis">{r.description}</div><div className="small muted">{r.category}{r.endDate ? ` · até ${formatDateBR(r.endDate)}` : ""}</div></div></div></td>
                <td data-l="Dia" className="c-date">{it ? formatDateBR(it.date).slice(0, 5) : `dia ${r.dueDay}`}</td>
                <td data-l="Valor" className="right c-val">{it ? <Amount item={it} /> : <span className="muted">{formatBRL(valueAt(r, month))}</span>}</td>
                <td className="hide-md muted c-method">{r.method === CREDIT && r.cardId && data.cards[r.cardId] ? `Crédito · ${data.cards[r.cardId].name}` : r.method}</td>
                <td className="hide-md c-prof"><span className={cls("ptag", `ptag-${r.profile}`)}>{PROFILE_LABEL[r.profile]}</span></td>
                <td data-l="Status" className="c-status">{it ? <StatusBadge item={it} /> : <span className="muted small">Fora do período</span>}</td>
                <td className="right c-act" onClick={(e) => e.stopPropagation()}>
                  <div className="actions">
                    {it && it.status === "pending" && <Button size="xs" variant="soft" icon={<LuCheck />} onClick={() => open({ kind: "pay", item: it })}>{r.kind === "income" ? "Receber" : "Pagar"}</Button>}
                    {it && it.status === "paid" && !it.isCredit && <Button size="xs" variant="ghost" icon={<LuUndo2 />} title="Desfazer pagamento deste mês" onClick={() => { update((d) => ops.unpay(d, it)); toast("Pagamento do mês desfeito", "info"); }} />}
                    {it && <Button size="xs" variant="ghost" title="Editar só este mês" aria-label="Editar só este mês" onClick={() => open({ kind: "occurrence", recId: r.id, month })}>Este mês</Button>}
                    <Button size="xs" variant="ghost" icon={<LuPencil />} title="Editar recorrência" onClick={() => open({ kind: "recurring", id: r.id })} />
                    <Button size="xs" variant="ghost" className="hover-danger" icon={<LuTrash2 />} title="Excluir" onClick={() => it ? open({ kind: "delete", item: it }) : open({ kind: "confirm", title: "Excluir recorrência?", message: `“${r.description}” e todo o seu histórico irão para a lixeira.`, danger: true, confirmLabel: "Excluir", onConfirm: () => update((d) => ops.remove(d, "recurring", r.id, r.description), "Recorrência excluída") })} />
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
          {!shown.length && <Empty title="Nenhuma conta neste filtro" />}
        </section>
      )}
    </div>
  );
}

// ---------------- Parcelamentos ----------------
export function InstallmentsPage() {
  const { data, items, view, month, open, today } = useApp();
  const ls = useListSort();
  const plans = Object.values(data.installments).filter((p) => matchesProfile(p, view));
  const sums = plans.map((p) => ({ p, s: planSummary(items, p, month) }));
  const active = sums.filter(({ s }) => s.remainingCount > 0);
  const debt = active.reduce((t, { s }) => t + s.remainingCents, 0);
  const monthCount = sums.reduce((t, { s }) => t + s.thisMonthCount, 0);
  const monthCents = sums.reduce((t, { s }) => t + s.thisMonthCents, 0);
  return (
    <div className="page">
      <div className="page-head"><div><h2>Parcelamentos</h2><p className="muted small">Parcelas futuras não diminuem o saldo até serem pagas — aparecem no planejamento.</p></div>
        <Button variant="primary" icon={<LuPlus />} onClick={() => open({ kind: "installment" })}>Nova despesa parcelada</Button></div>
      <div className="stat-chips">
        <div className="stat-chip static"><span>Saldo devedor total</span><strong className="neg">{formatBRL(debt)}</strong></div>
        <div className="stat-chip static"><span>Parcelas em {monthShort(month)}</span><strong>{monthCount} · {formatBRL(monthCents)}</strong></div>
        <div className="stat-chip static"><span>Parcelamentos ativos</span><strong>{active.length}</strong></div>
        <div className="stat-chip static"><span>Quitados</span><strong>{sums.length - active.length}</strong></div>
      </div>
      {!plans.length ? <section className="panel"><Empty icon={<LuLayers />} title="Nenhum parcelamento" text="Cadastre compras e dívidas parceladas para acompanhar parcelas, saldo devedor e quitação." action={<Button variant="soft" icon={<LuPlus />} onClick={() => open({ kind: "installment" })}>Cadastrar</Button>} /></section> :
        <div className="plans">{sortList(sums.sort((a, b) => (a.s.remainingCount === 0 ? 1 : 0) - (b.s.remainingCount === 0 ? 1 : 0) || (a.s.nextDue?.date || "").localeCompare(b.s.nextDue?.date || "")), ls, {
          date: ({ s }) => s.nextDue?.date || s.payoffDate, alpha: ({ p }) => p.description, amount: ({ s }) => s.remainingCents, category: ({ p }) => p.category,
          type: ({ p }) => (p.method === CREDIT ? 1 : 0), status: ({ s }) => (s.remainingCount === 0 ? 2 : s.nextDue && s.nextDue.date < today ? 0 : 1),
        }).map(({ p }) => <PlanCard key={p.id} id={p.id} />)}</div>}
    </div>
  );
}

function PlanCard({ id }: { id: string }) {
  const { data, items, month, open, update, toast } = useApp();
  const [exp, setExp] = useState(false);
  const p = data.installments[id];
  const s = planSummary(items, p, month);
  const mine = items.filter((i) => i.source === "inst" && i.refId === id).sort((a, b) => a.installmentNo! - b.installmentNo!);
  const card = p.method === CREDIT && p.cardId ? data.cards[p.cardId] : null;
  const next = mine.find((i) => i.status === "pending");
  return (
    <section className={cls("panel plan", s.remainingCount === 0 && "done")}>
      <div className="plan-head">
        <span className="ticon warn"><LuLayers /></span>
        <div className="grow minw0"><h3 className="ellipsis">{p.description}</h3><div className="small muted">{p.category} · {card ? `Crédito · ${card.name}` : p.method} · <span className={cls("ptag", `ptag-${p.profile}`)}>{PROFILE_LABEL[p.profile]}</span></div></div>
        <div className="actions">
          {next && !next.isCredit && <Button size="sm" variant="soft" icon={<LuCheck />} onClick={() => open({ kind: "pay", item: next })}>Pagar parcela {next.installmentNo}</Button>}
          {next && next.isCredit && <span className="small muted">Paga via fatura</span>}
          <Button size="xs" variant="ghost" icon={<LuPencil />} title="Editar" onClick={() => open({ kind: "installment", id })} />
          <Button size="xs" variant="ghost" className="hover-danger" icon={<LuTrash2 />} title="Excluir" onClick={() => open({ kind: "delete", item: mine[0] })} />
        </div>
      </div>
      <div className="plan-progress">
        <div className="row between small"><span><b>{s.paidCount} de {p.total}</b> parcelas pagas — {formatPct(s.progress)} concluído</span><span>{s.remainingCount === 0 ? <b className="pos">Quitado</b> : `${s.remainingCount} restantes`}</span></div>
        <Progress value={s.progress} tone={s.remainingCount === 0 ? "ok" : undefined} />
      </div>
      <div className="plan-kv">
        <KV k="Parcela" v={formatBRL(p.installmentCents)} />
        <KV k="Valor total" v={formatBRL(s.total)} />
        <KV k="Já pago" v={formatBRL(s.paidCents)} />
        <KV k="Saldo devedor" v={<span className="neg">{formatBRL(s.remainingCents)}</span>} />
        <KV k="Próximo vencimento" v={s.nextDue ? `${formatDateBR(s.nextDue.date)} (${s.nextDue.n}ª)` : "—"} />
        <KV k="Quitação prevista" v={formatDateBR(s.payoffDate)} />
      </div>
      <button className="link small" onClick={() => setExp(!exp)}>{exp ? <LuChevronDown /> : <LuChevronRight />} {exp ? "Ocultar" : "Ver"} todas as parcelas</button>
      {exp && <ul className="inst-list fade-in">{mine.map((it) => (
        <li key={it.key} className={cls(it.status === "paid" && "paid", dueState(it) === "overdue" && "overdue")}>
          <span className="inst-n">{it.installmentNo}</span>
          <span className="grow">{formatDateBR(it.date)}{it.paidDate && !it.pre && <span className="muted small"> · pago em {formatDateBR(it.paidDate)}</span>}</span>
          <span>{formatBRL(it.amountCents)}</span>
          <StatusBadge item={it} />
          <span className="actions">
            {it.status === "pending" && !it.isCredit && <Button size="xs" variant="soft" onClick={() => open({ kind: "pay", item: it })}>Pagar</Button>}
            {it.status === "pending" && it.isCredit && <Button size="xs" variant="ghost" onClick={() => open({ kind: "pay", item: it })}>Fatura</Button>}
            {it.status === "paid" && (!it.isCredit || it.pre) && <Button size="xs" variant="ghost" icon={<LuUndo2 />} title="Corrigir: marcar como não paga" onClick={() => open({ kind: "confirm", title: `Desfazer pagamento da parcela ${it.installmentNo}?`, message: "Use para corrigir uma parcela marcada como paga por engano. O saldo e os gráficos serão recalculados.", confirmLabel: "Desfazer", onConfirm: () => { update((d) => ops.unpay(d, it)); toast("Parcela voltou a ficar pendente", "info"); } })} />}
          </span>
        </li>
      ))}</ul>}
    </section>
  );
}

// ---------------- Cartões ----------------
export function CardsPage() {
  const { data, items, view, open } = useApp();
  const cards = sortList(Object.values(data.cards).filter((c) => matchesProfile(c, view)), useListSort(), { alpha: (c) => c.name, date: (c) => String(c.dueDay).padStart(2, "0"), amount: (c) => c.limitCents || 0 });
  return (
    <div className="page">
      <div className="page-head"><div><h2>Cartões e faturas</h2><p className="muted small">Data da compra, competência da fatura e saída efetiva do dinheiro ficam separadas. A compra é a despesa; o pagamento da fatura é só a saída de caixa.</p></div>
        <Button variant="primary" icon={<LuPlus />} onClick={() => open({ kind: "card" })}>Novo cartão</Button></div>
      {!cards.length ? <section className="panel"><Empty icon={<LuCreditCard />} title="Nenhum cartão cadastrado" text="Cadastro opcional. Com ele, as compras no crédito são agrupadas em faturas." action={<Button variant="soft" icon={<LuPlus />} onClick={() => open({ kind: "card" })}>Cadastrar cartão</Button>} /></section> :
        cards.map((c) => <CardBlock key={c.id} id={c.id} />)}
      {void items}
    </div>
  );
}

function CardBlock({ id }: { id: string }) {
  const { data, items, month, today, open, update, toast } = useApp();
  const c = data.cards[id];
  const [openM, setOpenM] = useState<string | null>(null);
  const invs = items.filter((i) => i.source === "invoice" && i.refId === id).sort((a, b) => b.occ!.localeCompare(a.occ!));
  const cur = monthOf(today);
  const visible = invs.filter((i) => i.occ! <= addMonths(cur, 3) && (i.status === "pending" || i.occ! >= addMonths(month, -6)));
  const openCredit = items.filter((i) => i.isCredit && i.cardId === id && i.status === "pending" && !i.pre && (i.source !== "rec" || i.date <= today)).reduce((s, i) => s + i.amountCents, 0);
  return (
    <section className="panel">
      <div className="plan-head">
        <span className="ticon info"><LuCreditCard /></span>
        <div className="grow"><h3>{c.name}</h3><div className="small muted">Fecha dia {c.closingDay} · vence dia {c.dueDay} · <span className={cls("ptag", `ptag-${c.profile}`)}>{PROFILE_LABEL[c.profile]}</span></div></div>
        <div className="actions">
          <Button size="sm" variant="soft" icon={<LuPlus />} onClick={() => open({ kind: "tx", txType: "expense", preset: { method: CREDIT, cardId: id } })}>Compra</Button>
          <Button size="xs" variant="ghost" icon={<LuPencil />} onClick={() => open({ kind: "card", id })} />
          <Button size="xs" variant="ghost" className="hover-danger" icon={<LuTrash2 />} onClick={() => open({ kind: "confirm", title: "Excluir cartão?", message: "As compras vinculadas continuam registradas, mas passam a ser tratadas como despesas comuns (sem fatura). O cartão vai para a lixeira.", danger: true, confirmLabel: "Excluir", onConfirm: () => update((d) => ops.remove(d, "cards", id, c.name), "Cartão excluído") })} />
        </div>
      </div>
      {c.limitCents ? <div className="plan-progress"><div className="row between small"><span>Limite usado (faturas em aberto)</span><span><b>{formatBRL(openCredit)}</b> de {formatBRL(c.limitCents)}</span></div><Progress value={(openCredit / c.limitCents) * 100} tone={openCredit > c.limitCents * 0.9 ? "danger" : openCredit > c.limitCents * 0.7 ? "warn" : undefined} /></div> : null}
      {!visible.length ? <p className="muted small">Nenhuma fatura ainda.</p> : (
        <ul className="invoices">{visible.map((inv) => {
          const its = items.filter((i) => i.isCredit && i.cardId === id && i.invoiceMonth === inv.occ && !i.pre).sort((a, b) => a.date.localeCompare(b.date));
          const total = its.reduce((s, i) => s + i.amountCents, 0);
          const diff = inv.status === "paid" ? total - inv.amountCents : 0;
          return (
            <li key={inv.key}>
              <div className="inv-row" onClick={() => setOpenM(openM === inv.occ ? null : inv.occ!)}>
                {openM === inv.occ ? <LuChevronDown /> : <LuChevronRight />}
                <strong className="grow">Fatura {monthLabel(inv.occ!)}</strong>
                <span className="muted small hide-sm">vence {formatDateBR(inv.date)}</span>
                <span className="nowrap"><b>{formatBRL(inv.amountCents)}</b></span>
                <StatusBadge item={inv} />
                <span className="actions" onClick={(e) => e.stopPropagation()}>
                  {inv.status === "pending" ? <Button size="xs" variant="soft" icon={<LuCheck />} onClick={() => open({ kind: "pay", item: inv })}>Pagar</Button>
                    : <Button size="xs" variant="ghost" icon={<LuUndo2 />} title="Desfazer pagamento da fatura" onClick={() => open({ kind: "confirm", title: "Desfazer pagamento da fatura?", message: "A fatura e suas compras voltam a ficar pendentes.", confirmLabel: "Desfazer", onConfirm: () => { update((d) => ops.unpay(d, inv)); toast("Pagamento da fatura desfeito", "info"); } })} />}
                </span>
              </div>
              {diff !== 0 && <p className="small warn-text">Atenção: compras somam {formatBRL(total)}, mas foi registrado pagamento de {formatBRL(inv.amountCents)}.</p>}
              {openM === inv.occ && <ul className="mini-list fade-in">{its.map((i) => (
                <li key={i.key}><span className="muted small nowrap">{formatDateBR(i.date)}</span><span className="grow ellipsis">{i.description}</span><span className="muted small hide-sm">{i.category}</span><strong>{formatBRL(i.amountCents)}</strong>
                  <Button size="xs" variant="ghost" icon={<LuEye />} onClick={() => open({ kind: "details", item: i })} /></li>
              ))}{!its.length && <li className="muted small">Sem compras.</li>}</ul>}
            </li>
          );
        })}</ul>
      )}
    </section>
  );
}

// ---------------- Metas ----------------
export function GoalsPage() {
  const { data, view, open, update } = useApp();
  const goals = Object.values(data.goals).filter((g) => matchesProfile(g, view));
  return (
    <div className="page">
      <div className="page-head"><div><h2>Metas financeiras</h2><p className="muted small">Valores efetivamente reservados contam no progresso; valores planejados aparecem à parte.</p></div>
        <Button variant="primary" icon={<LuPlus />} onClick={() => open({ kind: "goal" })}>Nova meta</Button></div>
      <section className="panel"><GoalsGrid /></section>
      {goals.filter((g) => g.kind === "acumulo" && g.entries.length).map((g) => {
        const pr = goalProgress(g);
        return (
          <Panel key={g.id} title={`Movimentos — ${g.name}`} icon={<LuPiggyBank />} action={<span className="small muted">Reservado {formatBRL(pr.reserved)} · Planejado {formatBRL(pr.planned)}</span>}>
            <ul className="mini-list">{[...g.entries].sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
              <li key={e.id}>
                <span className="muted small nowrap">{formatDateBR(e.date)}</span><span className="grow ellipsis">{e.note || (e.kind === "reserved" ? "Reserva" : "Planejado")}</span>
                <span className={cls("badge", e.kind === "reserved" ? "badge-ok" : "badge-muted")}>{e.kind === "reserved" ? "Reservado" : "Planejado"}</span>
                <strong>{formatBRL(e.amountCents)}</strong>
                {e.kind === "planned" && <Button size="xs" variant="soft" onClick={() => update((d) => ops.upsertGoal(d, { ...g, entries: g.entries.map((x) => x.id === e.id ? { ...x, kind: "reserved", date: todayISO() } : x) }), "Marcado como reservado")}>Reservar</Button>}
                <Button size="xs" variant="ghost" className="hover-danger" icon={<LuTrash2 />} onClick={() => open({ kind: "confirm", title: "Remover movimento?", message: `${formatBRL(e.amountCents)} em ${formatDateBR(e.date)}`, danger: true, confirmLabel: "Remover", onConfirm: () => update((d) => ops.upsertGoal(d, { ...g, entries: g.entries.filter((x) => x.id !== e.id) }), "Movimento removido") })} />
              </li>
            ))}</ul>
          </Panel>
        );
      })}
      <div className="row gap wrap">{goals.map((g) => <Button key={g.id} size="sm" variant="ghost" className="hover-danger" icon={<LuTrash2 />} onClick={() => open({ kind: "confirm", title: "Excluir meta?", message: `“${g.name}” vai para a lixeira.`, danger: true, confirmLabel: "Excluir", onConfirm: () => update((d) => ops.remove(d, "goals", g.id, g.name), "Meta excluída") })}>Excluir “{g.name}”</Button>)}</div>
    </div>
  );
}

export { monthMetrics, dateInMonth, ProfileTag, LuTarget };
