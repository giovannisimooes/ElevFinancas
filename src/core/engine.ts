// Motor financeiro: gera as ocorrências concretas a partir dos cadastros e calcula todos os indicadores.
// Nenhuma ocorrência de recorrência ou parcela é gravada como lançamento separado → não há duplicidade.

import type { AppData, Card, Item, Profile, ProfileView, Recurring, InstallmentPlan, Tx, Goal } from "./types";
import { type ISODate, type MonthKey, addMonths, dateInMonth, monthOf, lastDay, todayISO, monthDiff, daysBetween } from "./dates";
import type { Cents } from "./money";

export const CREDIT = "Crédito";

/** Mês de vencimento da fatura em que cai uma compra feita em `date`. */
export function invoiceMonthFor(card: Pick<Card, "closingDay" | "dueDay">, date: ISODate): MonthKey {
  const m = monthOf(date);
  const day = Number(date.slice(8, 10));
  const closingThisMonth = Number(dateInMonth(m, card.closingDay).slice(8, 10));
  const closingMonth = day > closingThisMonth ? addMonths(m, 1) : m;
  return card.dueDay > card.closingDay ? closingMonth : addMonths(closingMonth, 1);
}

export function valueAt(r: Recurring, mk: MonthKey): Cents {
  let v = r.values[0]?.amountCents ?? 0;
  for (const e of r.values) if (e.from <= mk) v = e.amountCents;
  return v;
}

export function installmentDueDate(p: InstallmentPlan, n: number): ISODate {
  return dateInMonth(addMonths(monthOf(p.firstDueDate), n - 1), p.dueDay);
}

function cardOf(data: AppData, method: string, cardId?: string | null): Card | null {
  if (method !== CREDIT || !cardId) return null;
  return data.cards[cardId] || null;
}

export interface BuildResult { items: Item[]; horizon: MonthKey }

/** Gera todas as ocorrências até `horizon` (inclusive). */
export function buildItems(data: AppData, horizon: MonthKey): Item[] {
  const items: Item[] = [];

  const creditStatus = (card: Card, inv: MonthKey) => {
    const p = card.invoices[inv];
    return p ? { status: "paid" as const, paidDate: p.paidDate } : { status: "pending" as const, paidDate: null };
  };

  for (const t of Object.values(data.txs)) items.push(txItem(data, t, creditStatus));

  for (const r of Object.values(data.recurring)) {
    const start = monthOf(r.startDate);
    const endM = r.endDate ? monthOf(r.endDate) : horizon;
    const stop = endM < horizon ? endM : horizon;
    for (let m = start; m <= stop; m = addMonths(m, 1)) {
      const occ = r.occurrences[m] || {};
      if (occ.skipped) continue;
      const due = occ.dueDate || dateInMonth(m, r.dueDay);
      const natural = dateInMonth(m, r.dueDay);
      if (natural < r.startDate) continue;
      if (r.endDate && natural > r.endDate) continue;
      const amount = occ.amountCents ?? valueAt(r, m);
      const card = r.kind === "expense" ? cardOf(data, r.method, r.cardId) : null;
      let status: "paid" | "pending" = occ.status === "paid" ? "paid" : "pending";
      let paidDate: ISODate | null = occ.status === "paid" ? occ.paidDate || due : null;
      let competence = monthOf(due);
      let invoiceMonth: MonthKey | undefined;
      if (card) {
        invoiceMonth = invoiceMonthFor(card, due);
        competence = invoiceMonth;
        ({ status, paidDate } = creditStatus(card, invoiceMonth));
      }
      items.push({
        key: `rec:${r.id}:${m}`, source: "rec", refId: r.id, occ: m,
        type: r.kind, description: r.description, category: r.category, origin: r.origin,
        method: r.method, cardId: card ? card.id : r.cardId, profile: r.profile,
        amountCents: amount, date: due, competence, invoiceMonth, status, paidDate,
        isCredit: !!card, fixed: r.kind === "expense" ? r.fixed !== false : false, notes: occ.notes || r.notes,
      });
    }
  }

  for (const p of Object.values(data.installments)) {
    const card = cardOf(data, p.method, p.cardId);
    for (let n = 1; n <= p.total; n++) {
      const due = installmentDueDate(p, n);
      const pay = p.payments[String(n)];
      let status: "paid" | "pending" = pay ? "paid" : "pending";
      let paidDate: ISODate | null = pay ? pay.paidDate || due : null;
      let competence = monthOf(due);
      let invoiceMonth: MonthKey | undefined;
      if (card) {
        invoiceMonth = monthOf(due);
        competence = invoiceMonth;
        if (!pay?.pre) ({ status, paidDate } = creditStatus(card, invoiceMonth));
      }
      items.push({
        key: `inst:${p.id}:${n}`, source: "inst", refId: p.id, occ: String(n),
        type: "expense", description: `${p.description} (${n}/${p.total})`, category: p.category,
        method: p.method, cardId: card ? card.id : p.cardId, profile: p.profile,
        amountCents: p.installmentCents, date: due, competence, invoiceMonth, status, paidDate,
        isCredit: !!card, pre: !!pay?.pre, fixed: false, notes: p.notes,
        installmentNo: n, installmentTotal: p.total,
      });
    }
  }

  // Faturas: agregam os itens de crédito. São apenas a SAÍDA de caixa, nunca uma despesa a mais.
  const invTotals = new Map<string, Cents>();
  for (const it of items) {
    if (it.isCredit && it.invoiceMonth && it.cardId && !it.pre) {
      const k = `${it.cardId}|${it.invoiceMonth}`;
      invTotals.set(k, (invTotals.get(k) || 0) + (it.type === "income" ? -it.amountCents : it.amountCents));
    }
  }
  for (const card of Object.values(data.cards)) {
    const months = new Set<string>(Object.keys(card.invoices));
    for (const k of invTotals.keys()) if (k.startsWith(card.id + "|")) months.add(k.split("|")[1]);
    for (const m of months) {
      const total = invTotals.get(`${card.id}|${m}`) || 0;
      const paid = card.invoices[m];
      if (!paid && total <= 0) continue;
      items.push({
        key: `invoice:${card.id}:${m}`, source: "invoice", refId: card.id, occ: m,
        type: "invoice", description: `Fatura ${card.name}`, category: "Fatura de cartão",
        method: "Fatura", cardId: card.id, profile: card.profile,
        amountCents: paid ? paid.amountCents : total, date: dateInMonth(m, card.dueDay), competence: m,
        status: paid ? "paid" : "pending", paidDate: paid ? paid.paidDate : null,
        isCredit: false, fixed: false,
      });
    }
  }
  return items;
}

function txItem(data: AppData, t: Tx, creditStatus: (c: Card, m: MonthKey) => { status: "paid" | "pending"; paidDate: ISODate | null }): Item {
  const card = t.type === "expense" ? cardOf(data, t.method, t.cardId) : null;
  let status = t.status;
  let paidDate = t.status === "paid" ? t.paidDate || t.date : null;
  let competence = monthOf(t.date);
  let invoiceMonth: MonthKey | undefined;
  if (card) {
    invoiceMonth = invoiceMonthFor(card, t.date);
    competence = invoiceMonth;
    ({ status, paidDate } = creditStatus(card, invoiceMonth));
  }
  if (t.type === "transfer") { status = "paid"; paidDate = t.paidDate || t.date; }
  return {
    key: `tx:${t.id}`, source: "tx", refId: t.id, type: t.type, description: t.description,
    category: t.type === "transfer" ? "Transferência entre perfis" : t.category, origin: t.origin,
    method: t.method, cardId: card ? card.id : t.cardId, profile: t.profile, toProfile: t.toProfile,
    amountCents: t.amountCents, date: t.date, competence, invoiceMonth, status, paidDate,
    isCredit: !!card, fixed: false, notes: t.notes,
  };
}

export function matchesProfile(it: { profile: Profile; toProfile?: Profile }, view: ProfileView): boolean {
  if (view === "geral") return true;
  return it.profile === view || it.toProfile === view;
}

/** Efeito de um item no caixa do perfil (0 se não movimenta dinheiro). */
export function cashEffect(it: Item, view: ProfileView): Cents {
  if (it.status !== "paid" || it.pre) return 0;
  if (it.type === "transfer") {
    if (view === "geral") return 0;
    let v = 0;
    if (it.profile === view) v -= it.amountCents;
    if (it.toProfile === view) v += it.amountCents;
    return v;
  }
  if (!matchesProfile(it, view)) return 0;
  if (it.type === "income") return it.amountCents;
  if (it.type === "invoice") return -it.amountCents;
  if (it.type === "expense" && !it.isCredit) return -it.amountCents;
  return 0;
}

function initialFor(data: AppData, view: ProfileView) {
  const profs: Profile[] = view === "geral" ? ["pessoal", "elev"] : [view];
  return profs.map((p) => ({ p, ...data.settings.initialBalance[p] }));
}

/** Saldo em conta ao final do dia `at`. */
export function balanceAt(data: AppData, items: Item[], view: ProfileView, at: ISODate): Cents {
  let total = 0;
  const inits = initialFor(data, view);
  for (const i of inits) total += i.amountCents || 0;
  for (const it of items) {
    if (it.status !== "paid" || it.pre || !it.paidDate || it.paidDate > at) continue;
    if (view === "geral") {
      // respeita data do saldo inicial do perfil dono
      const init = data.settings.initialBalance[it.profile];
      if (init?.date && it.paidDate < init.date) continue;
      total += cashEffect(it, "geral");
    } else {
      const init = data.settings.initialBalance[view];
      if (init?.date && it.paidDate < init.date) continue;
      total += cashEffect(it, view);
    }
  }
  return total;
}

/** O que é "a pagar" de fato: despesas fora do cartão e faturas. */
export function isPayable(it: Item): boolean {
  return (it.type === "expense" && !it.isCredit) || it.type === "invoice";
}

export interface MonthMetrics {
  incomeReceived: Cents; incomePending: Cents; incomeTotal: Cents;
  expensePaid: Cents; expensePending: Cents; expenseTotal: Cents;
  resultRealized: Cents; resultForecast: Cents;
  balanceNow: Cents; balanceEndOfMonth: Cents; projectedEnd: Cents;
  toPayMonth: Cents; overdueCount: number; overdueCents: Cents;
  creditMonth: Cents; debitMonth: Cents;
}

export function monthMetrics(data: AppData, items: Item[], view: ProfileView, mk: MonthKey, today = todayISO()): MonthMetrics {
  let incomeReceived = 0, incomePending = 0, expensePaid = 0, expensePending = 0, creditMonth = 0, debitMonth = 0;
  let toPayMonth = 0, overdueCount = 0, overdueCents = 0;
  const end = lastDay(mk);
  let pendIn = 0, pendOut = 0;
  for (const it of items) {
    if (!matchesProfile(it, view)) continue;
    if (it.type !== "transfer" && it.competence === mk) {
      if (it.type === "income") { if (it.status === "paid") incomeReceived += it.amountCents; else incomePending += it.amountCents; }
      if (it.type === "expense") {
        if (it.status === "paid") expensePaid += it.amountCents; else expensePending += it.amountCents;
        if (it.method === CREDIT) creditMonth += it.amountCents; else debitMonth += it.amountCents;
      }
      if (isPayable(it) && it.status === "pending") toPayMonth += it.amountCents;
    }
    if (it.status === "pending" && it.type !== "transfer") {
      if (isPayable(it) && it.date < today) { overdueCount++; overdueCents += it.amountCents; }
      if (it.date <= end) {
        if (it.type === "income") pendIn += it.amountCents;
        else if (isPayable(it)) pendOut += it.amountCents;
      }
    }
  }
  const balanceNow = balanceAt(data, items, view, today);
  const balanceEndOfMonth = balanceAt(data, items, view, end < today ? end : today);
  const projectedEnd = end < today ? balanceEndOfMonth : balanceNow + pendIn - pendOut;
  return {
    incomeReceived, incomePending, incomeTotal: incomeReceived + incomePending,
    expensePaid, expensePending, expenseTotal: expensePaid + expensePending,
    resultRealized: incomeReceived - expensePaid,
    resultForecast: incomeReceived + incomePending - expensePaid - expensePending,
    balanceNow, balanceEndOfMonth, projectedEnd, toPayMonth, overdueCount, overdueCents, creditMonth, debitMonth,
  };
}

export function byCategory(items: Item[], view: ProfileView, mk: MonthKey | null, type: "income" | "expense", months?: Set<string>): { name: string; cents: Cents }[] {
  const map = new Map<string, Cents>();
  for (const it of items) {
    if (it.type !== type || !matchesProfile(it, view)) continue;
    if (mk && it.competence !== mk) continue;
    if (months && !months.has(it.competence)) continue;
    map.set(it.category, (map.get(it.category) || 0) + it.amountCents);
  }
  return [...map.entries()].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents);
}

export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export type DueState = "paid" | "overdue" | "soon" | "pending";

export function dueState(it: Item, today = todayISO()): DueState {
  if (it.status === "paid") return "paid";
  if (it.date < today) return "overdue";
  if (daysBetween(today, it.date) <= 7) return "soon";
  return "pending";
}

export interface PlanSummary {
  total: Cents; paidCents: Cents; remainingCents: Cents; paidCount: number; remainingCount: number;
  progress: number; nextDue: { n: number; date: ISODate } | null; payoffDate: ISODate; thisMonthCount: number; thisMonthCents: Cents;
}

export function planSummary(items: Item[], p: InstallmentPlan, mk: MonthKey): PlanSummary {
  const mine = items.filter((i) => i.source === "inst" && i.refId === p.id).sort((a, b) => (a.installmentNo! - b.installmentNo!));
  const paid = mine.filter((i) => i.status === "paid");
  const next = mine.find((i) => i.status !== "paid");
  const inMonth = mine.filter((i) => i.competence === mk);
  return {
    total: p.installmentCents * p.total,
    paidCents: paid.length * p.installmentCents,
    remainingCents: (p.total - paid.length) * p.installmentCents,
    paidCount: paid.length,
    remainingCount: p.total - paid.length,
    progress: p.total ? (paid.length / p.total) * 100 : 0,
    nextDue: next ? { n: next.installmentNo!, date: next.date } : null,
    payoffDate: installmentDueDate(p, p.total),
    thisMonthCount: inMonth.length,
    thisMonthCents: inMonth.reduce((s, i) => s + i.amountCents, 0),
  };
}

export function goalProgress(g: Goal, monthResult?: Cents) {
  const reserved = g.entries.filter((e) => e.kind === "reserved").reduce((s, e) => s + e.amountCents, 0);
  const planned = g.entries.filter((e) => e.kind === "planned").reduce((s, e) => s + e.amountCents, 0);
  const current = g.kind === "mensal" ? Math.max(0, monthResult || 0) : reserved;
  return { reserved, planned, current, progress: g.targetCents ? Math.min(100, (current / g.targetCents) * 100) : 0, missing: Math.max(0, g.targetCents - current) };
}

/** Horizonte de geração: 24 meses à frente do maior entre hoje e o mês visto. */
export function horizonFor(selected: MonthKey, today = todayISO()): MonthKey {
  const base = selected > monthOf(today) ? selected : monthOf(today);
  return addMonths(base, 24);
}

/** Converte "parcelas já pagas" + "próximo vencimento" do formulário no 1º vencimento. */
export function firstDueFrom(nextDue: ISODate, paidCount: number, dueDay: number): ISODate {
  return dateInMonth(addMonths(monthOf(nextDue), -paidCount), dueDay);
}

export function earliestMonth(data: AppData, fallback: MonthKey): MonthKey {
  let min = fallback;
  for (const t of Object.values(data.txs)) if (monthOf(t.date) < min) min = monthOf(t.date);
  for (const r of Object.values(data.recurring)) if (monthOf(r.startDate) < min) min = monthOf(r.startDate);
  for (const p of Object.values(data.installments)) if (monthOf(p.firstDueDate) < min) min = monthOf(p.firstDueDate);
  return min;
}

export { monthDiff };
