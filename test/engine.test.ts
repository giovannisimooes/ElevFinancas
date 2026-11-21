import assert from "node:assert/strict";
import { parseBRL, formatBRL, centsToInput } from "../src/core/money";
import { dateInMonth, addMonths, isValidISO, daysInMonth } from "../src/core/dates";
import { buildItems, monthMetrics, invoiceMonthFor, planSummary, firstDueFrom, balanceAt, byCategory } from "../src/core/engine";
import { emptyData, type AppData } from "../src/core/types";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok -", name); };
const stamp = "2026-11-01T00:00:00Z";

t("parseBRL", () => {
  assert.equal(parseBRL("500,00"), 50000);
  assert.equal(parseBRL("R$ 1.234,56"), 123456);
  assert.equal(parseBRL("1234.56"), 123456);
  assert.equal(parseBRL("1.234"), 123400);
  assert.equal(parseBRL("0,1"), 10);
  assert.equal(parseBRL("50"), 5000);
  assert.equal(parseBRL("abc"), null);
  assert.equal(parseBRL("1,234"), null);
  assert.equal(parseBRL("0,1") ! + parseBRL("0,2")!, 30); // sem erro de ponto flutuante
  assert.equal(centsToInput(123456), "1234,56");
  assert.match(formatBRL(123456), /1\.234,56/);
});

t("datas 29/30/31 e bissexto", () => {
  assert.equal(dateInMonth("2026-02", 31), "2026-02-28");
  assert.equal(dateInMonth("2028-02", 30), "2028-02-29");
  assert.equal(dateInMonth("2026-04", 31), "2026-04-30");
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(daysInMonth(2100, 2), 28);
  assert.equal(daysInMonth(2000, 2), 29);
  assert.ok(!isValidISO("2026-02-30"));
});

function base(): AppData {
  const d = emptyData();
  d.settings.initialBalance.pessoal = { amountCents: 100000, date: null };
  return d;
}

t("receita pendente não entra no saldo; recebida entra", () => {
  const d = base();
  d.txs.a = { id: "a", type: "income", description: "Cliente", amountCents: 50000, date: "2026-11-15", status: "pending", paidDate: null, category: "x", method: "Pix", profile: "pessoal", createdAt: stamp, updatedAt: stamp };
  let items = buildItems(d, "2027-12");
  let m = monthMetrics(d, items, "pessoal", "2026-11", "2026-11-21");
  assert.equal(m.balanceNow, 100000);
  assert.equal(m.incomePending, 50000);
  assert.equal(m.projectedEnd, 150000);
  d.txs.a.status = "paid"; d.txs.a.paidDate = "2026-11-20";
  items = buildItems(d, "2027-12");
  m = monthMetrics(d, items, "pessoal", "2026-11", "2026-11-21");
  assert.equal(m.balanceNow, 150000);
  assert.equal(m.incomeReceived, 50000);
});

t("recorrente: cada mês tem status próprio; alteração de valor preserva histórico", () => {
  const d = base();
  d.recurring.r = { id: "r", kind: "expense", description: "Internet", category: "c", method: "Pix", profile: "pessoal", dueDay: 31, startDate: "2026-01-01", values: [{ from: "2026-01", amountCents: 10000 }], occurrences: { "2026-02": { status: "paid", paidDate: "2026-02-27", amountCents: 10000 } }, createdAt: stamp, updatedAt: stamp };
  d.recurring.r.values.push({ from: "2026-06", amountCents: 12000 });
  const items = buildItems(d, "2026-12").filter((i) => i.refId === "r");
  assert.equal(items.length, 12);
  assert.equal(items.find((i) => i.occ === "2026-02")!.date, "2026-02-28");
  assert.equal(items.filter((i) => i.status === "paid").length, 1);
  assert.equal(items.find((i) => i.occ === "2026-05")!.amountCents, 10000);
  assert.equal(items.find((i) => i.occ === "2026-07")!.amountCents, 12000);
});

t("recorrente com encerramento e mês excluído", () => {
  const d = base();
  d.recurring.r = { id: "r", kind: "expense", description: "Canva", category: "c", method: "Pix", profile: "elev", dueDay: 10, startDate: "2026-03-15", endDate: "2026-08-20", values: [{ from: "2026-03", amountCents: 3500 }], occurrences: { "2026-05": { skipped: true } }, createdAt: stamp, updatedAt: stamp };
  const items = buildItems(d, "2026-12").filter((i) => i.refId === "r");
  assert.deepEqual(items.map((i) => i.occ), ["2026-04", "2026-06", "2026-07", "2026-08"]);
});

t("parcelamento: 4 de 12 pagas, futuras não afetam saldo", () => {
  const d = base();
  const first = firstDueFrom("2026-12-10", 4, 10);
  assert.equal(first, "2026-08-10");
  const payments: Record<string, any> = {};
  for (let i = 1; i <= 4; i++) payments[i] = { paidDate: null, pre: true };
  d.installments.p = { id: "p", description: "Celular", category: "Compras", installmentCents: 15000, total: 12, firstDueDate: first, dueDay: 10, method: "Pix", profile: "pessoal", payments, createdAt: stamp, updatedAt: stamp };
  let items = buildItems(d, "2028-01");
  let s = planSummary(items, d.installments.p, "2026-12");
  assert.equal(s.total, 180000); assert.equal(s.paidCents, 60000); assert.equal(s.remainingCents, 120000);
  assert.equal(s.remainingCount, 8); assert.equal(s.payoffDate, "2027-07-10"); assert.equal(s.nextDue!.n, 5);
  assert.equal(balanceAt(d, items, "pessoal", "2026-11-21"), 100000);
  d.installments.p.payments["5"] = { paidDate: "2026-11-21" };
  items = buildItems(d, "2028-01");
  s = planSummary(items, d.installments.p, "2026-12");
  assert.equal(s.paidCount, 5); assert.equal(s.nextDue!.n, 6);
  assert.equal(balanceAt(d, items, "pessoal", "2026-11-21"), 85000);
  const m = monthMetrics(d, items, "pessoal", "2026-12", "2026-11-21");
  assert.equal(m.expensePaid, 15000); // parcela 5 compete em dezembro, paga adiantado
  assert.equal(items.filter((i) => i.refId === "p").length, 12); // sem duplicar
});

t("cartão: compra e fatura não contam em dobro", () => {
  const d = base();
  d.cards.c = { id: "c", name: "Nubank", closingDay: 3, dueDay: 10, profile: "pessoal", invoices: {}, createdAt: stamp, updatedAt: stamp };
  assert.equal(invoiceMonthFor(d.cards.c, "2026-11-02"), "2026-11");
  assert.equal(invoiceMonthFor(d.cards.c, "2026-11-05"), "2026-12");
  assert.equal(invoiceMonthFor({ closingDay: 25, dueDay: 5 }, "2026-11-20"), "2026-12");
  assert.equal(invoiceMonthFor({ closingDay: 25, dueDay: 5 }, "2026-11-26"), "2027-01");
  d.txs.x = { id: "x", type: "expense", description: "Mercado", amountCents: 20000, date: "2026-11-05", status: "paid", paidDate: "2026-11-05", category: "Supermercado", method: "Crédito", cardId: "c", profile: "pessoal", createdAt: stamp, updatedAt: stamp };
  let items = buildItems(d, "2027-12");
  assert.equal(balanceAt(d, items, "pessoal", "2026-11-21"), 100000); // compra no crédito não sai do caixa
  let m = monthMetrics(d, items, "pessoal", "2026-12", "2026-11-21");
  assert.equal(m.expenseTotal, 20000); assert.equal(m.expensePending, 20000); assert.equal(m.toPayMonth, 20000);
  d.cards.c.invoices["2026-12"] = { paidDate: "2026-12-10", amountCents: 20000 };
  items = buildItems(d, "2027-12");
  m = monthMetrics(d, items, "pessoal", "2026-12", "2026-12-15");
  assert.equal(m.expenseTotal, 20000); // continua 1x
  assert.equal(m.expensePaid, 20000);
  assert.equal(m.balanceNow, 80000);
  assert.equal(byCategory(items, "pessoal", "2026-12", "expense").find((c) => c.name === "Fatura de cartão"), undefined);
});

t("perfis e transferência", () => {
  const d = base();
  d.settings.initialBalance.elev = { amountCents: 500000, date: null };
  d.txs.t = { id: "t", type: "transfer", description: "Pró-labore", amountCents: 200000, date: "2026-11-05", status: "paid", paidDate: "2026-11-05", category: "", method: "Pix", profile: "elev", toProfile: "pessoal", createdAt: stamp, updatedAt: stamp };
  const items = buildItems(d, "2027-01");
  assert.equal(balanceAt(d, items, "elev", "2026-11-21"), 300000);
  assert.equal(balanceAt(d, items, "pessoal", "2026-11-21"), 300000);
  assert.equal(balanceAt(d, items, "geral", "2026-11-21"), 600000);
  const m = monthMetrics(d, items, "pessoal", "2026-11", "2026-11-21");
  assert.equal(m.incomeTotal, 0); // transferência não é receita
});

t("data do saldo inicial ignora movimentos anteriores", () => {
  const d = base();
  d.settings.initialBalance.pessoal = { amountCents: 100000, date: "2026-11-10" };
  d.txs.o = { id: "o", type: "expense", description: "antigo", amountCents: 5000, date: "2026-11-01", status: "paid", paidDate: "2026-11-01", category: "x", method: "Pix", profile: "pessoal", createdAt: stamp, updatedAt: stamp };
  d.txs.n = { id: "n", type: "expense", description: "novo", amountCents: 5000, date: "2026-11-15", status: "paid", paidDate: "2026-11-15", category: "x", method: "Pix", profile: "pessoal", createdAt: stamp, updatedAt: stamp };
  const items = buildItems(d, "2027-01");
  assert.equal(balanceAt(d, items, "pessoal", "2026-11-21"), 95000);
});

console.log(`\n${n} testes passaram`);
