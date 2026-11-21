// Dados de DEMONSTRAÇÃO: ficam só na memória, nunca são salvos e somem ao sair do modo demonstração.
import { emptyData, type AppData } from "../core/types";
import { addMonths, dateInMonth, monthOf, type ISODate } from "../core/dates";
import { firstDueFrom, buildItems } from "../core/engine";

export function demoData(today: ISODate): AppData {
  const d = emptyData();
  const s = "2026-01-01T00:00:00Z";
  const m = monthOf(today);
  const pm = addMonths(m, -1), ppm = addMonths(m, -2);
  d.settings.initialBalance = { pessoal: { amountCents: 350000, date: dateInMonth(ppm, 1) }, elev: { amountCents: 820000, date: dateInMonth(ppm, 1) } };
  d.cards.c1 = { id: "c1", name: "Cartão Exemplo", closingDay: 3, dueDay: 10, limitCents: 500000, profile: "pessoal", invoices: { [pm]: { paidDate: dateInMonth(pm, 10), amountCents: 0 } }, createdAt: s, updatedAt: s };
  const tx = (id: string, type: "income" | "expense", description: string, cents: number, date: ISODate, category: string, method: string, profile: "pessoal" | "elev", paid: boolean, cardId?: string) => {
    d.txs[id] = { id, type, description, amountCents: cents, date, status: paid ? "paid" : "pending", paidDate: paid ? date : null, category, method, cardId: cardId || null, profile, createdAt: s, updatedAt: s };
  };
  for (const [i, mm] of [ppm, pm, m].entries()) {
    tx(`a${i}`, "income", "Cliente exemplo A", 450000, dateInMonth(mm, 5), "Clientes / Serviços", "Pix", "elev", mm !== m || today >= dateInMonth(mm, 5));
    tx(`b${i}`, "income", "Cliente exemplo B", 280000, dateInMonth(mm, 20), "Clientes / Serviços", "Pix", "elev", mm !== m);
    tx(`c${i}`, "expense", "Supermercado (exemplo)", 62000 + i * 4000, dateInMonth(mm, 8), "Supermercado", "Débito", "pessoal", true);
    tx(`d${i}`, "expense", "Combustível (exemplo)", 25000, dateInMonth(mm, 12), "Combustível", "Pix", "pessoal", mm !== m);
    tx(`e${i}`, "expense", "Restaurante (exemplo)", 18000, dateInMonth(mm, 2), "Alimentação", "Crédito", "pessoal", true, "c1");
    tx(`f${i}`, "expense", "Anúncios (exemplo)", 90000, dateInMonth(mm, 15), "Marketing", "Pix", "elev", mm !== m);
  }
  d.txs.tr = { id: "tr", type: "transfer", description: "Pró-labore (exemplo)", amountCents: 300000, date: dateInMonth(pm, 6), status: "paid", paidDate: dateInMonth(pm, 6), category: "", method: "Pix", profile: "elev", toProfile: "pessoal", createdAt: s, updatedAt: s };
  const rec = (id: string, description: string, cents: number, day: number, category: string, profile: "pessoal" | "elev", method = "Pix", cardId?: string) => {
    d.recurring[id] = { id, kind: "expense", description, category, method, cardId: cardId || null, profile, dueDay: day, startDate: dateInMonth(ppm, 1), values: [{ from: ppm, amountCents: cents }], occurrences: {}, createdAt: s, updatedAt: s };
    for (const mm of [ppm, pm]) d.recurring[id].occurrences[mm] = { status: "paid", paidDate: dateInMonth(mm, day), amountCents: cents };
  };
  rec("r1", "Aluguel (exemplo)", 150000, 5, "Moradia", "pessoal");
  rec("r2", "Internet (exemplo)", 11000, 15, "Energia / Água / Internet", "pessoal");
  rec("r3", "Assinatura IA (exemplo)", 11000, 20, "Ferramentas / Software", "elev", "Crédito", "c1");
  const first = firstDueFrom(dateInMonth(m, 10), 4, 10);
  d.installments.p1 = { id: "p1", description: "Celular (exemplo)", category: "Compras", installmentCents: 15000, total: 12, firstDueDate: first, dueDay: 10, method: "Pix", profile: "pessoal", payments: { 1: { paidDate: null, pre: true }, 2: { paidDate: null, pre: true }, 3: { paidDate: null, pre: true }, 4: { paidDate: null, pre: true } }, createdAt: s, updatedAt: s };
  d.goals.g1 = { id: "g1", name: "Reserva financeira (exemplo)", kind: "acumulo", targetCents: 500000, category: "Reserva", profile: "pessoal", entries: [{ id: "e1", date: dateInMonth(pm, 10), amountCents: 150000, kind: "reserved" }, { id: "e2", date: dateInMonth(m, 28), amountCents: 50000, kind: "planned" }], createdAt: s, updatedAt: s };
  d.goals.g2 = { id: "g2", name: "Resultado mínimo do mês (exemplo)", kind: "mensal", targetCents: 300000, category: "Resultado", profile: "elev", entries: [], createdAt: s, updatedAt: s };
  // valor da fatura paga do mês anterior = soma do que caiu nela
  delete d.cards.c1.invoices[pm];
  const inv = buildItems(d, addMonths(m, 2)).find((i) => i.source === "invoice" && i.occ === pm);
  if (inv) d.cards.c1.invoices[pm] = { paidDate: dateInMonth(pm, 10), amountCents: inv.amountCents };
  return d;
}
