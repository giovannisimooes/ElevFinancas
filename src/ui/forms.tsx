import React, { useMemo, useState } from "react";
import { LuTrendingUp, LuTrendingDown, LuLayers, LuRepeat, LuTarget, LuArrowLeftRight, LuCreditCard, LuCheck, LuTrash2, LuPiggyBank, LuInfo } from "react-icons/lu";
import { useApp, ops, type ModalSpec } from "./state";
import { Modal, Field, MoneyInput, Button, Segmented, Select, KV, Progress, StatusBadge, cls, methodLabel } from "./components";
import { parseBRL, centsToInput, formatBRL, formatPct } from "../core/money";
import { type AppData, type Item, type Profile, type Tx, type Recurring, type InstallmentPlan, type Goal, type Card, uid, nowStamp, PROFILE_LABEL } from "../core/types";
import { isValidISO, monthOf, todayISO, formatDateBR, monthLabel, addMonths, dateInMonth, addDays, monthShort } from "../core/dates";
import { CREDIT, invoiceMonthFor, firstDueFrom, valueAt, installmentDueDate, goalProgress } from "../core/engine";

const profileOpts = [{ value: "pessoal", label: "Pessoal" }, { value: "elev", label: "ELEV" }];

function useDefaultProfile(): Profile { const { view } = useApp(); return view === "geral" ? "pessoal" : view; }

function CardPicker({ method, cardId, setCardId }: { method: string; cardId: string; setCardId: (v: string) => void }) {
  const { data, open } = useApp();
  if (method !== CREDIT) return null;
  const cards = Object.values(data.cards);
  return (
    <Field label="Cartão de crédito" hint={!cards.length ? <span>Nenhum cartão cadastrado. <button type="button" className="link" onClick={() => open({ kind: "card" })}>Cadastrar cartão</button> (opcional)</span> : "A compra entra na fatura do cartão"}>
      <Select value={cardId} onChange={setCardId} placeholder={cards.length ? "Sem cartão vinculado" : "—"} options={cards.map((c) => ({ value: c.id, label: c.name }))} />
    </Field>
  );
}

function CreditInfo({ data, method, cardId, date }: { data: AppData; method: string; cardId: string; date: string }) {
  const card = method === CREDIT && cardId ? data.cards[cardId] : null;
  if (!card || !isValidISO(date)) return null;
  const inv = invoiceMonthFor(card, date);
  return <div className="note span2"><LuInfo /> <span>Compra em <b>{formatDateBR(date)}</b> → fatura de <b>{monthLabel(inv)}</b> (vence {formatDateBR(dateInMonth(inv, card.dueDay))}). O dinheiro só sai do saldo quando a fatura for paga.</span></div>;
}

// ---------- Novo lançamento ----------
export function NewChooser() {
  const { close, open } = useApp();
  const go = (m: ModalSpec) => { close(); open(m); };
  const opts: { icon: React.ReactNode; t: string; d: string; m: ModalSpec; tone: string }[] = [
    { icon: <LuTrendingUp />, t: "Nova entrada", d: "Receita recebida ou a receber", m: { kind: "tx", txType: "income" }, tone: "pos" },
    { icon: <LuTrendingDown />, t: "Nova despesa", d: "Gasto do dia a dia, pago ou pendente", m: { kind: "tx", txType: "expense" }, tone: "neg" },
    { icon: <LuLayers />, t: "Nova despesa parcelada", d: "Compra ou dívida em parcelas", m: { kind: "installment" }, tone: "warn" },
    { icon: <LuRepeat />, t: "Nova conta recorrente", d: "Aluguel, internet, assinaturas…", m: { kind: "recurring" }, tone: "info" },
    { icon: <LuTarget />, t: "Nova meta financeira", d: "Reserva ou meta de resultado do mês", m: { kind: "goal" }, tone: "p" },
    { icon: <LuArrowLeftRight />, t: "Transferência entre perfis", d: "Pessoal ↔ ELEV, sem virar receita", m: { kind: "tx", txType: "transfer" }, tone: "muted" },
  ];
  return (
    <Modal title="Novo lançamento" subtitle="O que você quer registrar?" onClose={close} width={620}>
      <div className="chooser">
        {opts.map((o) => (
          <button key={o.t} type="button" className={cls("choice", `tone-${o.tone}`)} onClick={() => go(o.m)}>
            <span className="choice-icon">{o.icon}</span><span><strong>{o.t}</strong><small>{o.d}</small></span>
          </button>
        ))}
      </div>
      <div className="row gap center muted small" style={{ marginTop: 12 }}>
        <LuCreditCard /> <span>Usa cartão de crédito?</span> <button className="link" onClick={() => go({ kind: "card" })}>Cadastrar cartão</button>
      </div>
    </Modal>
  );
}

// ---------- Entrada / Despesa / Transferência ----------
export function TxForm({ txType, id, preset }: { txType: "income" | "expense" | "transfer"; id?: string; preset?: Partial<Tx> }) {
  const { data, close, update } = useApp();
  const defProfile = useDefaultProfile();
  const existing = id ? data.txs[id] : undefined;
  const base = existing || preset;
  const today = todayISO();
  const cats = txType === "income" ? data.settings.incomeCategories : data.settings.expenseCategories;
  const [f, setF] = useState({
    description: base?.description || "",
    amount: base?.amountCents != null ? centsToInput(base.amountCents) : "",
    date: base?.date || today,
    category: base?.category || "",
    origin: base?.origin || "",
    method: base?.method || (txType === "income" ? "Pix" : "Pix"),
    cardId: base?.cardId || "",
    profile: (base?.profile || (txType === "transfer" ? "elev" : defProfile)) as Profile,
    toProfile: (base?.toProfile || "pessoal") as Profile,
    notes: base?.notes || "",
    status: (base?.status || (txType === "expense" ? "paid" : "pending")) as "paid" | "pending",
    paidDate: base?.paidDate || "",
    recurrence: "unica" as "unica" | "mensal",
  });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (v: any) => setF((s) => ({ ...s, [k]: v }));
  const isCredit = txType === "expense" && f.method === CREDIT && !!f.cardId && !!data.cards[f.cardId];

  const save = () => {
    const e: Record<string, string> = {};
    const cents = parseBRL(f.amount);
    if (!f.description.trim()) e.description = "Informe uma descrição";
    if (cents == null || cents <= 0) e.amount = "Informe um valor maior que zero";
    if (!isValidISO(f.date)) e.date = "Data inválida";
    if (txType !== "transfer" && !f.category) e.category = "Escolha uma categoria";
    if (txType === "transfer" && f.profile === f.toProfile) e.toProfile = "Escolha perfis diferentes";
    const paidDate = f.status === "paid" && !isCredit ? (isValidISO(f.paidDate) ? f.paidDate : f.date) : null;
    if (Object.keys(e).length) { setErr(e); return; }
    const stamp = nowStamp();
    if (txType === "income" && f.recurrence === "mensal" && !existing) {
      const m = monthOf(f.date);
      const r: Recurring = {
        id: uid("rec"), kind: "income", description: f.description.trim(), category: f.category, origin: f.origin, method: f.method, profile: f.profile,
        notes: f.notes, dueDay: Number(f.date.slice(8, 10)), startDate: f.date, endDate: null, values: [{ from: m, amountCents: cents! }],
        occurrences: f.status === "paid" ? { [m]: { status: "paid", paidDate: paidDate!, amountCents: cents! } } : {}, createdAt: stamp, updatedAt: stamp,
      };
      update((d) => ops.upsertRec(d, r), "Receita mensal cadastrada");
      close(); return;
    }
    const t: Tx = {
      id: existing?.id || uid("tx"), type: txType, description: f.description.trim(), amountCents: cents!, date: f.date,
      status: txType === "transfer" ? "paid" : isCredit ? "pending" : f.status, paidDate: txType === "transfer" ? f.date : isCredit ? null : paidDate,
      category: txType === "transfer" ? "Transferência" : f.category, origin: txType === "income" ? f.origin : undefined,
      method: f.method, cardId: f.method === CREDIT ? f.cardId || null : null, profile: f.profile,
      toProfile: txType === "transfer" ? f.toProfile : undefined, notes: f.notes,
      createdAt: existing?.createdAt || stamp, updatedAt: stamp,
    };
    if (t.toProfile === undefined) delete t.toProfile;
    if (t.origin === undefined) delete t.origin;
    update((d) => ops.upsertTx(d, t), existing ? "Lançamento atualizado" : txType === "income" ? "Entrada registrada" : txType === "expense" ? "Despesa registrada" : "Transferência registrada");
    close();
  };

  const title = (existing ? "Editar " : "Nova ") + (txType === "income" ? "entrada" : txType === "expense" ? "despesa" : "transferência");
  const icon = txType === "income" ? <LuTrendingUp /> : txType === "expense" ? <LuTrendingDown /> : <LuArrowLeftRight />;
  return (
    <Modal title={title} onClose={close} icon={icon} footer={<><Button onClick={close}>Cancelar</Button><Button variant="primary" onClick={save} icon={<LuCheck />}>Salvar</Button></>}>
      <form className="grid2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label={txType === "expense" ? "Nome do gasto" : "Descrição"} error={err.description} span={2}>
          <input value={f.description} onChange={(e) => set("description")(e.target.value)} placeholder={txType === "income" ? "Ex.: Mensalidade cliente" : txType === "expense" ? "Ex.: Combustível" : "Ex.: Pró-labore"} />
        </Field>
        <Field label="Valor" error={err.amount}><MoneyInput value={f.amount} onChange={set("amount")} /></Field>
        <Field label={txType === "income" ? "Data do recebimento/vencimento" : txType === "expense" ? (f.method === CREDIT ? "Data da compra" : "Data") : "Data"} error={err.date}>
          <input type="date" value={f.date} onChange={(e) => set("date")(e.target.value)} />
        </Field>
        {txType === "transfer" ? <>
          <Field label="De (sai do perfil)"><Select value={f.profile} onChange={set("profile")} options={profileOpts} /></Field>
          <Field label="Para (entra no perfil)" error={err.toProfile}><Select value={f.toProfile} onChange={set("toProfile")} options={profileOpts} /></Field>
          <Field label="Forma"><Select value={f.method} onChange={set("method")} options={data.settings.methods.filter((m) => m !== CREDIT)} /></Field>
          <div className="note"><LuInfo /> <span>Transferências movem saldo entre perfis e não contam como receita nem despesa.</span></div>
        </> : <>
          <Field label="Categoria" error={err.category}><Select value={f.category} onChange={set("category")} placeholder="Selecione…" options={cats} /></Field>
          {txType === "income" && <Field label="Origem da receita"><input value={f.origin} onChange={(e) => set("origin")(e.target.value)} placeholder="Ex.: Cliente Real Massas" /></Field>}
          <Field label={txType === "income" ? "Forma de recebimento" : "Forma de pagamento"}><Select value={f.method} onChange={set("method")} options={txType === "income" ? data.settings.methods.filter((m) => m !== CREDIT) : data.settings.methods} /></Field>
          {txType === "expense" && <CardPicker method={f.method} cardId={f.cardId} setCardId={set("cardId")} />}
          <Field label="Perfil financeiro"><Segmented value={f.profile} onChange={set("profile")} options={profileOpts as any} /></Field>
          {!isCredit && <Field label="Status"><Segmented value={f.status} onChange={set("status")} options={[{ value: "paid", label: txType === "income" ? "Recebido" : "Pago" }, { value: "pending", label: "Pendente" }]} /></Field>}
          {!isCredit && f.status === "paid" && <Field label={txType === "income" ? "Recebido em" : "Pago em"} hint="Data em que o dinheiro entrou/saiu"><input type="date" value={f.paidDate || f.date} onChange={(e) => set("paidDate")(e.target.value)} /></Field>}
          {txType === "income" && !existing && <Field label="Recorrência"><Segmented value={f.recurrence} onChange={set("recurrence")} options={[{ value: "unica", label: "Única" }, { value: "mensal", label: "Mensal" }]} /></Field>}
          {txType === "expense" && <CreditInfo data={data} method={f.method} cardId={f.cardId} date={f.date} />}
          {txType === "income" && f.recurrence === "mensal" && <div className="note span2"><LuRepeat /> <span>Será criada uma receita mensal com vencimento todo dia {Number(f.date.slice(8, 10))}. Cada mês terá seu próprio status.</span></div>}
          {f.status === "pending" && !isCredit && <div className="note span2 soft"><LuInfo /> <span>Pendente: não altera o saldo até ser marcado como {txType === "income" ? "recebido" : "pago"}.</span></div>}
        </>}
        <Field label="Observações" span={2}><textarea rows={2} value={f.notes} onChange={(e) => set("notes")(e.target.value)} /></Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ---------- Conta recorrente ----------
export function RecurringForm({ id, recKind }: { id?: string; recKind?: "income" | "expense" }) {
  const { data, close, update, month } = useApp();
  const defProfile = useDefaultProfile();
  const r = id ? data.recurring[id] : undefined;
  const today = todayISO();
  const curMonth = monthOf(today);
  const [f, setF] = useState({
    kind: (r?.kind || recKind || "expense") as "income" | "expense",
    description: r?.description || "",
    amount: r ? centsToInput(valueAt(r, curMonth > monthOf(r.startDate) ? curMonth : monthOf(r.startDate))) : "",
    dueDay: String(r?.dueDay || Number(today.slice(8, 10))),
    startDate: r?.startDate || dateInMonth(curMonth, 1),
    endDate: r?.endDate || "",
    category: r?.category || "",
    method: r?.method || "Pix",
    cardId: r?.cardId || "",
    profile: (r?.profile || defProfile) as Profile,
    notes: r?.notes || "",
    status: "pending" as "paid" | "pending",
    effFrom: curMonth,
    fixed: r ? r.fixed !== false : true,
  });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (v: any) => setF((s) => ({ ...s, [k]: v }));
  const cats = f.kind === "income" ? data.settings.incomeCategories : data.settings.expenseCategories;
  const cents = parseBRL(f.amount);
  const amountChanged = r && cents != null && cents !== valueAt(r, f.effFrom);

  const save = () => {
    const e: Record<string, string> = {};
    const day = Number(f.dueDay);
    if (!f.description.trim()) e.description = "Informe o nome";
    if (cents == null || cents <= 0) e.amount = "Valor inválido";
    if (!Number.isInteger(day) || day < 1 || day > 31) e.dueDay = "Dia entre 1 e 31";
    if (!isValidISO(f.startDate)) e.startDate = "Data inválida";
    if (f.endDate && (!isValidISO(f.endDate) || f.endDate < f.startDate)) e.endDate = "Encerramento deve ser após o início";
    if (!f.category) e.category = "Escolha uma categoria";
    if (Object.keys(e).length) { setErr(e); return; }
    const stamp = nowStamp();
    let values = r ? [...r.values] : [{ from: monthOf(f.startDate), amountCents: cents! }];
    if (r && amountChanged) {
      values = values.filter((v) => v.from < f.effFrom);
      values.push({ from: f.effFrom, amountCents: cents! });
      if (!values.some((v) => v.from <= monthOf(r.startDate))) values.unshift({ from: monthOf(r.startDate), amountCents: r.values[0]?.amountCents ?? cents! });
      values.sort((a, b) => a.from.localeCompare(b.from));
    }
    const occurrences = r ? { ...r.occurrences } : {};
    if (!r && f.status === "paid") {
      const m0 = monthOf(f.startDate) < curMonth ? curMonth : monthOf(f.startDate);
      occurrences[m0] = { status: "paid", paidDate: today, amountCents: cents! };
    }
    const rec: Recurring = {
      id: r?.id || uid("rec"), kind: f.kind, description: f.description.trim(), category: f.category, method: f.method,
      cardId: f.method === CREDIT ? f.cardId || null : null, profile: f.profile, notes: f.notes, dueDay: day,
      startDate: f.startDate, endDate: f.endDate || null, values, occurrences, fixed: f.fixed,
      createdAt: r?.createdAt || stamp, updatedAt: stamp,
    };
    update((d) => ops.upsertRec(d, rec), r ? "Recorrência atualizada" : "Conta recorrente cadastrada");
    close();
  };
  void month;
  return (
    <Modal title={r ? "Editar conta recorrente" : "Nova conta recorrente"} subtitle="Os vencimentos de cada mês são gerados automaticamente" icon={<LuRepeat />} onClose={close}
      footer={<><Button onClick={close}>Cancelar</Button><Button variant="primary" icon={<LuCheck />} onClick={save}>Salvar</Button></>}>
      <form className="grid2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {!r && <Field label="Tipo" span={2}><Segmented value={f.kind} onChange={(v) => setF((s) => ({ ...s, kind: v, category: "" }))} options={[{ value: "expense", label: "Despesa fixa" }, { value: "income", label: "Receita mensal" }]} /></Field>}
        <Field label="Nome" error={err.description} span={2}><input value={f.description} onChange={(e) => set("description")(e.target.value)} placeholder="Ex.: Internet, Claude, Aluguel" /></Field>
        <Field label="Valor mensal" error={err.amount}><MoneyInput value={f.amount} onChange={set("amount")} /></Field>
        <Field label="Dia do vencimento" error={err.dueDay} hint="Dias 29–31 caem no último dia em meses mais curtos"><input type="number" min={1} max={31} value={f.dueDay} onChange={(e) => set("dueDay")(e.target.value)} /></Field>
        {amountChanged && <Field label="Novo valor vale a partir de" span={2} hint="Meses anteriores e pagamentos já feitos mantêm o valor antigo">
          <Select value={f.effFrom} onChange={set("effFrom")} options={[-1, 0, 1, 2, 3].map((n) => addMonths(curMonth, n)).map((m) => ({ value: m, label: monthLabel(m) }))} />
        </Field>}
        <Field label="Data inicial" error={err.startDate}><input type="date" value={f.startDate} onChange={(e) => set("startDate")(e.target.value)} /></Field>
        <Field label="Encerramento (opcional)" error={err.endDate}><input type="date" value={f.endDate} onChange={(e) => set("endDate")(e.target.value)} /></Field>
        <Field label="Categoria" error={err.category}><Select value={f.category} onChange={set("category")} placeholder="Selecione…" options={cats} /></Field>
        <Field label="Forma de pagamento"><Select value={f.method} onChange={set("method")} options={f.kind === "income" ? data.settings.methods.filter((m) => m !== CREDIT) : data.settings.methods} /></Field>
        {f.kind === "expense" && <CardPicker method={f.method} cardId={f.cardId} setCardId={set("cardId")} />}
        <Field label="Perfil financeiro"><Segmented value={f.profile} onChange={set("profile")} options={profileOpts as any} /></Field>
        {!r && !(f.method === CREDIT && f.cardId) && <Field label="Status do mês atual"><Segmented value={f.status} onChange={set("status")} options={[{ value: "pending", label: "Pendente" }, { value: "paid", label: f.kind === "income" ? "Recebido" : "Pago" }]} /></Field>}
        {f.kind === "expense" && <Field label="Classificação"><Segmented value={f.fixed ? "1" : "0"} onChange={(v) => set("fixed")(v === "1")} options={[{ value: "1", label: "Fixa" }, { value: "0", label: "Variável" }]} /></Field>}
        <Field label="Observações" span={2}><textarea rows={2} value={f.notes} onChange={(e) => set("notes")(e.target.value)} /></Field>
        <div className="note span2 soft"><LuInfo /> <span>Pagar um mês não marca os meses seguintes. Cada vencimento tem status próprio.</span></div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** Editar apenas um mês de uma recorrência. */
export function OccurrenceForm({ recId, month: mk }: { recId: string; month: string }) {
  const { data, close, update, open } = useApp();
  const r = data.recurring[recId];
  const occ = r?.occurrences[mk] || {};
  const natural = r ? dateInMonth(mk, r.dueDay) : "";
  const [amount, setAmount] = useState(r ? centsToInput(occ.amountCents ?? valueAt(r, mk)) : "");
  const [due, setDue] = useState(occ.dueDate || natural);
  const [notes, setNotes] = useState(occ.notes || "");
  const [paidDate, setPaidDate] = useState(occ.paidDate || "");
  const [err, setErr] = useState("");
  if (!r) return null;
  const save = () => {
    const c = parseBRL(amount);
    if (c == null || c <= 0) { setErr("Valor inválido"); return; }
    if (!isValidISO(due)) { setErr("Data inválida"); return; }
    const next: Record<string, unknown> = { ...occ, notes: notes || undefined };
    if (c !== valueAt(r, mk)) { next.amountCents = c; delete next.amountFromPay; } else if (occ.status !== "paid") delete next.amountCents; else next.amountCents = c;
    if (due !== natural) next.dueDate = due; else delete next.dueDate;
    if (occ.status === "paid" && isValidISO(paidDate)) next.paidDate = paidDate;
    Object.keys(next).forEach((k) => next[k] === undefined && delete next[k]);
    update((d) => ops.upsertRec(d, { ...r, occurrences: { ...r.occurrences, [mk]: next as any } }), `${monthLabel(mk)} atualizado`);
    close();
  };
  return (
    <Modal title={`${r.description} — ${monthLabel(mk)}`} subtitle="Alterações aqui valem só para este mês" icon={<LuRepeat />} onClose={close}
      footer={<><Button variant="ghost" onClick={() => { close(); open({ kind: "recurring", id: r.id }); }}>Editar recorrência inteira</Button><span className="grow" /><Button onClick={close}>Cancelar</Button><Button variant="primary" icon={<LuCheck />} onClick={save}>Salvar este mês</Button></>}>
      <div className="grid2">
        <Field label="Valor deste mês" error={err}><MoneyInput value={amount} onChange={setAmount} /></Field>
        <Field label="Vencimento deste mês"><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        {occ.status === "paid" && <Field label="Pago em"><input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} /></Field>}
        <Field label="Observações do mês" span={2}><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="note span2 soft"><LuInfo /> <span>Valor padrão da recorrência neste mês: {formatBRL(valueAt(r, mk))}. Para mudar o valor dos próximos meses, use “Editar recorrência inteira”.</span></div>
      </div>
    </Modal>
  );
}

// ---------- Parcelamento ----------
export function InstallmentForm({ id }: { id?: string }) {
  const { data, close, update } = useApp();
  const defProfile = useDefaultProfile();
  const p = id ? data.installments[id] : undefined;
  const today = todayISO();
  const [f, setF] = useState({
    description: p?.description || "", category: p?.category || "",
    amount: p ? centsToInput(p.installmentCents) : "", total: String(p?.total || ""), paid: "0",
    nextDue: dateInMonth(addMonths(monthOf(today), 0), Number(today.slice(8, 10))),
    dueDay: String(p?.dueDay || ""), firstDue: p?.firstDueDate || "",
    method: p?.method || "Crédito", cardId: p?.cardId || "", profile: (p?.profile || defProfile) as Profile, notes: p?.notes || "",
  });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (v: any) => setF((s) => ({ ...s, [k]: v }));
  const cents = parseBRL(f.amount) || 0;
  const total = parseInt(f.total) || 0;
  const paid = p ? Object.keys(p.payments).length : Math.min(parseInt(f.paid) || 0, total);
  const dueDay = parseInt(f.dueDay) || (isValidISO(f.nextDue) ? Number(f.nextDue.slice(8, 10)) : 1);
  const first = p ? (isValidISO(f.firstDue) ? f.firstDue : p.firstDueDate) : isValidISO(f.nextDue) ? firstDueFrom(f.nextDue, paid, dueDay) : "";
  const payoff = first && total ? installmentDueDate({ firstDueDate: first, dueDay } as InstallmentPlan, total) : "";
  const maxPaidN = p ? Math.max(0, ...Object.keys(p.payments).map(Number)) : 0;

  const save = () => {
    const e: Record<string, string> = {};
    if (!f.description.trim()) e.description = "Informe o nome";
    if (!f.category) e.category = "Escolha uma categoria";
    if (!cents || cents <= 0) e.amount = "Valor inválido";
    if (!Number.isInteger(total) || total < 1 || total > 480) e.total = "Entre 1 e 480 parcelas";
    if (p && total < maxPaidN) e.total = `Já existe a parcela ${maxPaidN} paga`;
    if (!p && ((parseInt(f.paid) || 0) < 0 || (parseInt(f.paid) || 0) > total)) e.paid = "Não pode ser maior que o total";
    if (!p && !isValidISO(f.nextDue) && paid < total) e.nextDue = "Data inválida";
    if (dueDay < 1 || dueDay > 31) e.dueDay = "Dia entre 1 e 31";
    if (Object.keys(e).length) { setErr(e); return; }
    const stamp = nowStamp();
    let payments = p ? { ...p.payments } : {} as InstallmentPlan["payments"];
    if (!p) for (let i = 1; i <= paid; i++) payments[String(i)] = { paidDate: null, pre: true };
    if (p) payments = Object.fromEntries(Object.entries(payments).filter(([n]) => Number(n) <= total));
    const plan: InstallmentPlan = {
      id: p?.id || uid("inst"), description: f.description.trim(), category: f.category, installmentCents: cents, total,
      firstDueDate: first, dueDay, method: f.method, cardId: f.method === CREDIT ? f.cardId || null : null, profile: f.profile,
      notes: f.notes, payments, createdAt: p?.createdAt || stamp, updatedAt: stamp,
    };
    update((d) => ops.upsertInst(d, plan), p ? "Parcelamento atualizado" : "Parcelamento cadastrado");
    close();
  };

  return (
    <Modal title={p ? "Editar parcelamento" : "Nova despesa parcelada"} subtitle="Compras e dívidas em parcelas, com acompanhamento automático" icon={<LuLayers />} onClose={close} width={640}
      footer={<><Button onClick={close}>Cancelar</Button><Button variant="primary" icon={<LuCheck />} onClick={save}>Salvar</Button></>}>
      <form className="grid2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Nome da compra ou dívida" error={err.description} span={2}><input value={f.description} onChange={(e) => set("description")(e.target.value)} placeholder="Ex.: Celular" /></Field>
        <Field label="Valor de cada parcela" error={err.amount}><MoneyInput value={f.amount} onChange={set("amount")} /></Field>
        <Field label="Quantidade total de parcelas" error={err.total}><input type="number" min={1} value={f.total} onChange={(e) => set("total")(e.target.value)} /></Field>
        {!p ? <>
          <Field label="Parcelas já pagas" error={err.paid} hint="Pagas antes do cadastro — não alteram o saldo atual"><input type="number" min={0} value={f.paid} onChange={(e) => set("paid")(e.target.value)} /></Field>
          <Field label="Parcelas restantes"><input value={Math.max(0, total - paid) || ""} readOnly className="readonly" /></Field>
          <Field label={f.method === CREDIT && f.cardId ? "Próximo vencimento (fatura)" : "Data do próximo vencimento"} error={err.nextDue}><input type="date" value={f.nextDue} onChange={(e) => { set("nextDue")(e.target.value); if (isValidISO(e.target.value)) set("dueDay")(String(Number(e.target.value.slice(8, 10)))); }} /></Field>
        </> : <>
          <Field label="Vencimento da 1ª parcela" hint="Define o calendário de todas as parcelas"><input type="date" value={f.firstDue} onChange={(e) => set("firstDue")(e.target.value)} /></Field>
        </>}
        <Field label="Dia habitual do vencimento" error={err.dueDay}><input type="number" min={1} max={31} value={f.dueDay || dueDay} onChange={(e) => set("dueDay")(e.target.value)} /></Field>
        <Field label="Categoria" error={err.category}><Select value={f.category} onChange={set("category")} placeholder="Selecione…" options={data.settings.expenseCategories} /></Field>
        <Field label="Forma de pagamento"><Select value={f.method} onChange={set("method")} options={data.settings.methods} /></Field>
        <CardPicker method={f.method} cardId={f.cardId} setCardId={set("cardId")} />
        <Field label="Perfil financeiro"><Segmented value={f.profile} onChange={set("profile")} options={profileOpts as any} /></Field>
        <Field label="Observações" span={2}><textarea rows={2} value={f.notes} onChange={(e) => set("notes")(e.target.value)} /></Field>
        {total > 0 && cents > 0 && (
          <div className="calc span2">
            <KV k="Valor total" v={formatBRL(cents * total)} />
            <KV k="Já pago" v={formatBRL(cents * paid)} />
            <KV k="Saldo devedor" v={formatBRL(cents * (total - paid))} />
            <KV k="Quitação prevista" v={payoff ? formatDateBR(payoff) : "—"} />
            <div className="span-all"><div className="row between small"><span>{paid} de {total} parcelas pagas</span><strong>{formatPct((paid / total) * 100)}</strong></div><Progress value={(paid / total) * 100} /></div>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ---------- Metas ----------
export function GoalForm({ id }: { id?: string }) {
  const { data, close, update } = useApp();
  const defProfile = useDefaultProfile();
  const g = id ? data.goals[id] : undefined;
  const [f, setF] = useState({
    name: g?.name || "", kind: (g?.kind || "acumulo") as Goal["kind"], target: g ? centsToInput(g.targetCents) : "", reserved: "",
    deadline: g?.deadline || "", category: g?.category || "Reserva", profile: (g?.profile || defProfile) as Profile, notes: g?.notes || "",
  });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (v: any) => setF((s) => ({ ...s, [k]: v }));
  const save = () => {
    const e: Record<string, string> = {};
    const t = parseBRL(f.target);
    const r = f.reserved ? parseBRL(f.reserved) : 0;
    if (!f.name.trim()) e.name = "Informe o nome";
    if (t == null || t <= 0) e.target = "Valor inválido";
    if (r == null || r < 0) e.reserved = "Valor inválido";
    if (f.deadline && !isValidISO(f.deadline)) e.deadline = "Data inválida";
    if (Object.keys(e).length) { setErr(e); return; }
    const stamp = nowStamp();
    const entries = g ? g.entries : r ? [{ id: uid("ge"), date: todayISO(), amountCents: r!, kind: "reserved" as const, note: "Saldo inicial da meta" }] : [];
    const goal: Goal = { id: g?.id || uid("goal"), name: f.name.trim(), kind: f.kind, targetCents: t!, deadline: f.deadline || null, category: f.category, profile: f.profile, entries, notes: f.notes, createdAt: g?.createdAt || stamp, updatedAt: stamp };
    update((d) => ops.upsertGoal(d, goal), g ? "Meta atualizada" : "Meta criada");
    close();
  };
  return (
    <Modal title={g ? "Editar meta" : "Nova meta financeira"} icon={<LuTarget />} onClose={close} footer={<><Button onClick={close}>Cancelar</Button><Button variant="primary" icon={<LuCheck />} onClick={save}>Salvar</Button></>}>
      <form className="grid2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Tipo de meta" span={2}><Segmented value={f.kind} onChange={set("kind")} options={[{ value: "acumulo", label: "Reserva / objetivo" }, { value: "mensal", label: "Resultado do mês" }]} /></Field>
        <Field label="Nome da meta" error={err.name} span={2}><input value={f.name} onChange={(e) => set("name")(e.target.value)} placeholder={f.kind === "mensal" ? "Ex.: Sobrar R$ 3.000 por mês" : "Ex.: Reserva financeira"} /></Field>
        <Field label={f.kind === "mensal" ? "Resultado desejado no mês" : "Valor desejado"} error={err.target}><MoneyInput value={f.target} onChange={set("target")} /></Field>
        {f.kind === "acumulo" && !g && <Field label="Valor já reservado" error={err.reserved}><MoneyInput value={f.reserved} onChange={set("reserved")} /></Field>}
        {f.kind === "acumulo" && <Field label="Prazo" error={err.deadline}><input type="date" value={f.deadline} onChange={(e) => set("deadline")(e.target.value)} /></Field>}
        <Field label="Categoria"><input value={f.category} onChange={(e) => set("category")(e.target.value)} /></Field>
        <Field label="Perfil financeiro"><Segmented value={f.profile} onChange={set("profile")} options={profileOpts as any} /></Field>
        <Field label="Observações" span={2}><textarea rows={2} value={f.notes} onChange={(e) => set("notes")(e.target.value)} /></Field>
        {f.kind === "mensal" && <div className="note span2 soft"><LuInfo /> <span>O progresso é o resultado realizado do mês (recebido − pago) no perfil da meta. Aparece no cartão “Meta do mês”.</span></div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function GoalEntryForm({ goalId }: { goalId: string }) {
  const { data, close, update } = useApp();
  const g = data.goals[goalId];
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [kind, setKind] = useState<"reserved" | "planned">("reserved");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  if (!g) return null;
  const pr = goalProgress(g);
  const save = () => {
    const c = parseBRL(amount);
    if (c == null || c === 0) { setErr("Valor inválido (use negativo para retirar)"); return; }
    if (!isValidISO(date)) { setErr("Data inválida"); return; }
    update((d) => ops.upsertGoal(d, { ...g, entries: [...g.entries, { id: uid("ge"), date, amountCents: c, kind, note }] }), kind === "reserved" ? "Valor reservado" : "Valor planejado");
    close();
  };
  return (
    <Modal title={`Adicionar à meta: ${g.name}`} subtitle={`${formatBRL(pr.reserved)} reservados de ${formatBRL(g.targetCents)}`} icon={<LuPiggyBank />} onClose={close}
      footer={<><Button onClick={close}>Cancelar</Button><Button variant="primary" icon={<LuCheck />} onClick={save}>Adicionar</Button></>}>
      <div className="grid2">
        <Field label="Tipo" span={2}><Segmented value={kind} onChange={setKind} options={[{ value: "reserved", label: "Efetivamente reservado" }, { value: "planned", label: "Apenas planejado" }]} /></Field>
        <Field label="Valor" error={err}><MoneyInput value={amount} onChange={setAmount} /></Field>
        <Field label="Data"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Observação" span={2}><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

// ---------- Cartão ----------
export function CardForm({ id }: { id?: string }) {
  const { data, close, update } = useApp();
  const defProfile = useDefaultProfile();
  const c = id ? data.cards[id] : undefined;
  const [f, setF] = useState({ name: c?.name || "", closingDay: String(c?.closingDay || ""), dueDay: String(c?.dueDay || ""), limit: c?.limitCents ? centsToInput(c.limitCents) : "", profile: (c?.profile || defProfile) as Profile });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (v: any) => setF((s) => ({ ...s, [k]: v }));
  const save = () => {
    const e: Record<string, string> = {};
    const cd = Number(f.closingDay), dd = Number(f.dueDay);
    if (!f.name.trim()) e.name = "Informe o nome";
    if (!Number.isInteger(cd) || cd < 1 || cd > 31) e.closingDay = "Dia entre 1 e 31";
    if (!Number.isInteger(dd) || dd < 1 || dd > 31) e.dueDay = "Dia entre 1 e 31";
    const lim = f.limit ? parseBRL(f.limit) : null;
    if (f.limit && (lim == null || lim < 0)) e.limit = "Valor inválido";
    if (Object.keys(e).length) { setErr(e); return; }
    const stamp = nowStamp();
    const card: Card = { id: c?.id || uid("card"), name: f.name.trim(), closingDay: cd, dueDay: dd, limitCents: lim, profile: f.profile, invoices: c?.invoices || {}, createdAt: c?.createdAt || stamp, updatedAt: stamp };
    update((d) => ops.upsertCard(d, card), c ? "Cartão atualizado" : "Cartão cadastrado");
    close();
  };
  return (
    <Modal title={c ? "Editar cartão" : "Novo cartão de crédito"} icon={<LuCreditCard />} onClose={close} footer={<><Button onClick={close}>Cancelar</Button><Button variant="primary" icon={<LuCheck />} onClick={save}>Salvar</Button></>}>
      <form className="grid2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Nome do cartão" error={err.name} span={2}><input value={f.name} onChange={(e) => set("name")(e.target.value)} placeholder="Ex.: Nubank, Inter PJ" /></Field>
        <Field label="Dia do fechamento" error={err.closingDay}><input type="number" min={1} max={31} value={f.closingDay} onChange={(e) => set("closingDay")(e.target.value)} /></Field>
        <Field label="Dia do vencimento" error={err.dueDay}><input type="number" min={1} max={31} value={f.dueDay} onChange={(e) => set("dueDay")(e.target.value)} /></Field>
        <Field label="Limite (opcional)" error={err.limit}><MoneyInput value={f.limit} onChange={set("limit")} /></Field>
        <Field label="Perfil que paga a fatura"><Segmented value={f.profile} onChange={set("profile")} options={profileOpts as any} /></Field>
        <div className="note span2 soft"><LuInfo /> <span>Compras feitas até o dia do fechamento entram na fatura do mês; depois, na seguinte. A saída de dinheiro acontece só no pagamento da fatura — a compra não é contada duas vezes.</span></div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ---------- Pagamento ----------
export function PayForm({ item }: { item: Item }) {
  const { data, items, close, update } = useApp();
  // compra no crédito → paga-se a fatura correspondente
  const target = item.isCredit ? items.find((i) => i.key === `invoice:${item.cardId}:${item.invoiceMonth}`) || item : item;
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState(centsToInput(target.amountCents));
  const [err, setErr] = useState("");
  const inc = target.type === "income";
  const isInv = target.source === "invoice";
  const save = () => {
    if (!isValidISO(date)) { setErr("Data inválida"); return; }
    const c = isInv ? parseBRL(amount) : target.amountCents;
    if (c == null || c <= 0) { setErr("Valor inválido"); return; }
    update((d) => ops.pay(d, target, date, c), inc ? "Marcado como recebido" : isInv ? "Fatura paga" : "Marcado como pago");
    close();
  };
  return (
    <Modal title={inc ? "Marcar como recebido" : isInv ? "Pagar fatura" : "Marcar como pago"} subtitle={target.description} icon={<LuCheck />} onClose={close} width={460}
      footer={<><Button onClick={close}>Cancelar</Button><Button variant="primary" icon={<LuCheck />} onClick={save}>Confirmar</Button></>}>
      {item.isCredit && <div className="note"><LuCreditCard /> <span>“{item.description}” foi no crédito. Ela é quitada pelo pagamento da fatura de <b>{monthLabel(item.invoiceMonth!)}</b>, que reúne todas as compras do período.</span></div>}
      <div className="grid2" style={{ marginTop: 8 }}>
        <Field label={inc ? "Data efetiva do recebimento" : "Data efetiva do pagamento"} error={err}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {isInv ? <Field label="Valor pago"><MoneyInput value={amount} onChange={setAmount} /></Field> : <KV k="Valor" v={formatBRL(target.amountCents)} />}
      </div>
      {isInv && <p className="muted small">Vencimento: {formatDateBR(target.date)} · Total da fatura: {formatBRL(target.amountCents)}</p>}
      {void data}
    </Modal>
  );
}

// ---------- Detalhes ----------
export function DetailsView({ item: it0 }: { item: Item }) {
  const { data, items, close, open } = useApp();
  const it = items.find((i) => i.key === it0.key) || it0;
  const card = it.cardId ? data.cards[it.cardId] : null;
  const rows: [string, React.ReactNode][] = [
    ["Tipo", it.type === "income" ? "Entrada" : it.type === "expense" ? "Despesa" : it.type === "invoice" ? "Fatura de cartão" : "Transferência"],
    ["Valor", formatBRL(it.amountCents)],
    ["Status", <StatusBadge item={it} />],
    [it.isCredit ? "Data da compra" : it.type === "invoice" ? "Vencimento da fatura" : "Vencimento / data", formatDateBR(it.date)],
    ["Competência", monthLabel(it.competence)],
    ["Saída/entrada efetiva", it.pre ? "Antes do cadastro (não afeta o saldo)" : it.paidDate ? formatDateBR(it.paidDate) : "—"],
    ["Categoria", it.category],
    ["Forma", methodLabel(it, data.cards)],
    ["Perfil", it.type === "transfer" ? `${PROFILE_LABEL[it.profile]} → ${PROFILE_LABEL[it.toProfile!]}` : PROFILE_LABEL[it.profile]],
  ];
  if (it.isCredit && card) rows.push(["Fatura", `${card.name} · ${monthLabel(it.invoiceMonth!)} (vence ${formatDateBR(dateInMonth(it.invoiceMonth!, card.dueDay))})`]);
  if (it.origin) rows.push(["Origem", it.origin]);
  if (it.source === "rec") rows.push(["Recorrência", `Mensal, todo dia ${data.recurring[it.refId]?.dueDay}`]);
  if (it.installmentNo) rows.push(["Parcela", `${it.installmentNo} de ${it.installmentTotal}`]);
  if (it.notes) rows.push(["Observações", it.notes]);
  const invItems = it.source === "invoice" ? items.filter((i) => i.isCredit && i.cardId === it.refId && i.invoiceMonth === it.occ && !i.pre) : [];
  return (
    <Modal title={it.description} subtitle="Detalhes do lançamento" onClose={close} width={560}
      footer={<>{it.source === "invoice" && <Button variant="ghost" onClick={() => { close(); open({ kind: "card", id: it.refId }); }}>Editar cartão</Button>}<span className="grow" /><Button onClick={close}>Fechar</Button></>}>
      <div className="details">{rows.map(([k, v]) => <div key={k} className="kv"><span className="muted">{k}</span><span>{v}</span></div>)}</div>
      {it.source === "invoice" && <>
        <h4 style={{ margin: "16px 0 8px" }}>Compras nesta fatura ({invItems.length})</h4>
        <ul className="mini-list">{invItems.map((i) => <li key={i.key}><span className="muted small">{formatDateBR(i.date)}</span><span className="grow ellipsis">{i.description}</span><strong>{formatBRL(i.amountCents)}</strong></li>)}</ul>
      </>}
    </Modal>
  );
}

// ---------- Exclusão ----------
export function DeleteForm({ item }: { item: Item }) {
  const { data, close, update } = useApp();
  const del = (fn: (d: AppData) => AppData, msg: string) => { update(fn, msg); close(); };
  const footer = (extra: React.ReactNode) => <><Button onClick={close}>Cancelar</Button>{extra}</>;
  if (item.source === "tx") {
    return (
      <Modal title="Excluir lançamento?" subtitle={item.description} icon={<LuTrash2 />} onClose={close} width={460}
        footer={footer(<Button variant="danger" icon={<LuTrash2 />} onClick={() => del((d) => ops.remove(d, "txs", item.refId, item.description), "Lançamento excluído")}>Excluir</Button>)}>
        <p>O lançamento de {formatBRL(item.amountCents)} em {formatDateBR(item.date)} será removido. Você pode restaurá-lo em Configurações → Dados → Lixeira.</p>
      </Modal>
    );
  }
  if (item.source === "rec") {
    const r = data.recurring[item.refId];
    if (!r) return null;
    const mk = item.occ!;
    return (
      <Modal title="Excluir conta recorrente" subtitle={`${r.description} — ${monthLabel(mk)}`} icon={<LuTrash2 />} onClose={close} width={520} footer={<Button onClick={close}>Cancelar</Button>}>
        <div className="stack">
          <button className="choice" onClick={() => del((d) => ops.upsertRec(d, { ...r, occurrences: { ...r.occurrences, [mk]: { skipped: true } } }), `${monthLabel(mk)} removido`)}>
            <span><strong>Excluir só {monthLabel(mk)}</strong><small>Os outros meses continuam iguais</small></span></button>
          <button className="choice" onClick={() => del((d) => ops.upsertRec(d, { ...r, endDate: addDays(`${mk}-01`, -1) < r.startDate ? r.startDate : addDays(`${mk}-01`, -1) }), "Recorrência encerrada")}>
            <span><strong>Encerrar a partir de {monthLabel(mk)}</strong><small>Mantém o histórico dos meses anteriores</small></span></button>
          <button className="choice tone-neg" onClick={() => del((d) => ops.remove(d, "recurring", r.id, r.description), "Recorrência excluída")}>
            <span><strong>Excluir a recorrência inteira</strong><small>Remove todos os meses, inclusive o histórico de pagamentos (vai para a lixeira)</small></span></button>
        </div>
      </Modal>
    );
  }
  if (item.source === "inst") {
    const p = data.installments[item.refId];
    if (!p) return null;
    return (
      <Modal title="Excluir parcelamento?" subtitle={p.description} icon={<LuTrash2 />} onClose={close} width={480}
        footer={footer(<Button variant="danger" icon={<LuTrash2 />} onClick={() => del((d) => ops.remove(d, "installments", p.id, p.description), "Parcelamento excluído")}>Excluir parcelamento</Button>)}>
        <p>Todas as {p.total} parcelas de “{p.description}” serão removidas (o cadastro vai para a lixeira). Para corrigir só uma parcela paga por engano, use “Desfazer pagamento”.</p>
      </Modal>
    );
  }
  return null;
}

export function ConfirmDialog({ title, message, danger, confirmLabel, onConfirm }: { title: string; message: string; danger?: boolean; confirmLabel?: string; onConfirm: () => void }) {
  const { close } = useApp();
  return (
    <Modal title={title} onClose={close} width={440} footer={<><Button onClick={close}>Cancelar</Button><Button variant={danger ? "danger" : "primary"} onClick={() => { onConfirm(); close(); }}>{confirmLabel || "Confirmar"}</Button></>}>
      <p>{message}</p>
    </Modal>
  );
}

export function ModalHost() {
  const { modals } = useApp();
  const top = modals[modals.length - 1];
  if (!top) return null;
  switch (top.kind) {
    case "new": return <NewChooser />;
    case "tx": return <TxForm key={top.id || "n"} txType={top.txType} id={top.id} preset={top.preset} />;
    case "recurring": return <RecurringForm id={top.id} recKind={top.recKind} />;
    case "occurrence": return <OccurrenceForm recId={top.recId} month={top.month} />;
    case "installment": return <InstallmentForm id={top.id} />;
    case "goal": return <GoalForm id={top.id} />;
    case "goalEntry": return <GoalEntryForm goalId={top.goalId} />;
    case "card": return <CardForm id={top.id} />;
    case "pay": return <PayForm item={top.item} />;
    case "details": return <DetailsView item={top.item} />;
    case "delete": return <DeleteForm item={top.item} />;
    case "confirm": return <ConfirmDialog {...top} />;
    case "settings": return <SettingsLazy tab={top.tab} />;
  }
}

import { SettingsModal } from "./settings";
function SettingsLazy({ tab }: { tab?: string }) { return <SettingsModal tab={tab} />; }

export { useMemo, monthShort };
