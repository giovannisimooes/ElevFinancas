// Contas vinculadas (Mercado Pago, Nubank, Inter…) e importação de extratos para dentro do app.
import React, { useMemo, useRef, useState } from "react";
import { LuLandmark, LuFileUp, LuPlus, LuPencil, LuTrash2, LuCheck, LuInfo, LuTriangleAlert, LuSparkles } from "./icons";
import { useApp, ops } from "./state";
import { Modal, Button, Field, Segmented, Select, Empty, cls } from "./components";
import { type BankAccount, type Profile, type Tx, uid, nowStamp, PROFILE_LABEL } from "../core/types";
import { parseStatement, rowsFromTable, guessCategory, guessMethod, isInvoicePayment, prettyDescription, importKeyFor, payeeKey, type RawRow, type ColumnMap } from "../core/importer";
import { formatBRL } from "../core/money";
import { formatDateBR } from "../core/dates";

export const INSTITUTIONS = ["Mercado Pago", "Nubank", "Inter", "Itaú", "Bradesco", "Banco do Brasil", "Caixa", "Santander", "C6 Bank", "PicPay", "PagBank", "Outro"];

const HOWTO: Record<string, string> = {
  "Mercado Pago": "No app ou site do Mercado Pago, abra o extrato da conta → toque nos três pontinhos → “Gerar extrato da conta” → “Gerar novo extrato”, escolha o período e o formato .csv. Depois baixe o arquivo e envie aqui.",
  Nubank: "No app do Nubank, abra a conta → extrato → exportar/enviar extrato e escolha CSV ou OFX (quando disponível). Pelo site também dá para baixar em CSV.",
  default: "No app ou internet banking do seu banco, procure por “exportar extrato” e escolha o formato CSV ou OFX.",
};

// ---------- Aba de configurações ----------
export function AccountsTab() {
  const { data, update, open, close } = useApp();
  const accounts = data.settings.accounts || [];
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const save = (list: BankAccount[]) => update((d) => ({ ...d, settings: { ...d.settings, accounts: list } }));
  return (
    <div className="stack">
      <section>
        <h4>Contas vinculadas</h4>
        <div className="note"><LuInfo /> <span>
          Os bancos, incluindo o Mercado Pago, não oferecem um jeito aberto de um app pessoal como este ler o seu extrato sozinho — isso exige uma empresa autorizada de Open Finance e um servidor. Por isso a vinculação funciona assim: você cadastra a conta uma vez e, quando quiser atualizar, baixa o extrato no app do banco (.csv ou .ofx) e envia aqui. O ELEV FINANCE lê tudo, sugere categoria e forma de pagamento, aprende com as suas escolhas e <b>nunca importa a mesma movimentação duas vezes</b>.
        </span></div>
      </section>
      {!accounts.length && !editing && <Empty icon={<LuLandmark />} title="Nenhuma conta vinculada" text="Comece pela sua conta do Mercado Pago." action={<Button variant="primary" icon={<LuPlus />} onClick={() => setEditing({ id: "", name: "Mercado Pago", institution: "Mercado Pago", profile: "pessoal", method: "Pix" })}>Vincular Mercado Pago</Button>} />}
      {accounts.length > 0 && (
        <ul className="acc-list">
          {accounts.map((a) => {
            const n = Object.values(data.txs).filter((t) => t.accountId === a.id).length;
            return (
              <li key={a.id}>
                <span className="acc-icon"><LuLandmark /></span>
                <div className="grow minw0"><strong>{a.name}</strong><div className="small muted">{a.institution} · {PROFILE_LABEL[a.profile]} · {n} lançamentos importados{a.lastImport ? ` · última importação ${new Date(a.lastImport).toLocaleDateString("pt-BR")}` : ""}</div></div>
                <Button size="sm" variant="primary" icon={<LuFileUp />} onClick={() => { close(); open({ kind: "import", accountId: a.id }); }}>Importar extrato</Button>
                <Button size="xs" variant="ghost" icon={<LuPencil />} aria-label="Editar conta" onClick={() => setEditing(a)} />
                <Button size="xs" variant="ghost" className="hover-danger" icon={<LuTrash2 />} aria-label="Remover conta" onClick={() => open({ kind: "confirm", title: `Remover a conta ${a.name}?`, message: "Os lançamentos já importados continuam no app. Só a vinculação é removida.", danger: true, confirmLabel: "Remover", onConfirm: () => save(accounts.filter((x) => x.id !== a.id)) })} />
              </li>
            );
          })}
        </ul>
      )}
      {editing ? <AccountForm acc={editing} onCancel={() => setEditing(null)} onSave={(a) => { save(editing.id ? accounts.map((x) => (x.id === a.id ? a : x)) : [...accounts, { ...a, id: uid("acc") }]); setEditing(null); }} />
        : accounts.length > 0 && <Button icon={<LuPlus />} onClick={() => setEditing({ id: "", name: "", institution: "Mercado Pago", profile: "pessoal", method: "Pix" })}>Vincular outra conta</Button>}
    </div>
  );
}

function AccountForm({ acc, onSave, onCancel }: { acc: BankAccount; onSave: (a: BankAccount) => void; onCancel: () => void }) {
  const { data } = useApp();
  const [f, setF] = useState(acc);
  const [err, setErr] = useState("");
  return (
    <section className="acc-form">
      <h4>{acc.id ? "Editar conta" : "Vincular conta"}</h4>
      <div className="grid2">
        <Field label="Banco / instituição"><Select value={f.institution} onChange={(v) => setF({ ...f, institution: v, name: !f.name || INSTITUTIONS.includes(f.name) ? (v === "Outro" ? "" : v) : f.name })} options={INSTITUTIONS} /></Field>
        <Field label="Nome da conta" error={err}><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Mercado Pago pessoal" /></Field>
        <Field label="Perfil financeiro"><Segmented value={f.profile} onChange={(v: Profile) => setF({ ...f, profile: v })} options={[{ value: "pessoal", label: "Pessoal" }, { value: "elev", label: "ELEV" }]} /></Field>
        <Field label="Forma padrão (quando o extrato não disser)"><Select value={f.method} onChange={(v) => setF({ ...f, method: v })} options={data.settings.methods.filter((m) => m !== "Crédito")} /></Field>
      </div>
      <div className="row gap" style={{ marginTop: 10 }}>
        <Button onClick={onCancel}>Cancelar</Button>
        <Button variant="primary" icon={<LuCheck />} onClick={() => { if (!f.name.trim()) { setErr("Dê um nome para a conta"); return; } onSave({ ...f, name: f.name.trim() }); }}>Salvar conta</Button>
      </div>
    </section>
  );
}

// ---------- Importação ----------
interface PreviewRow {
  key: string; include: boolean; date: string; original: string; description: string; type: "income" | "expense";
  amountCents: number; category: string; method: string; flag?: string;
}

export function ImportModal({ accountId: initial }: { accountId?: string }) {
  const { data, close, update, open, toast } = useApp();
  const accounts = data.settings.accounts || [];
  const [accountId, setAccountId] = useState(initial || accounts[0]?.id || "");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [info, setInfo] = useState<{ format: string; warnings: string[] } | null>(null);
  const [manual, setManual] = useState<{ table: string[][]; header: string[]; map: ColumnMap } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const acc = accounts.find((a) => a.id === accountId);

  const existingKeys = useMemo(() => new Set(Object.values(data.txs).map((t) => t.importKey).filter(Boolean) as string[]), [data.txs]);

  const buildPreview = (raw: RawRow[]) => {
    if (!acc) return;
    const memory = data.settings.importMemory || {};
    const seen = new Map<string, number>();
    const manualTx = Object.values(data.txs).filter((t) => !t.importKey && t.status === "paid");
    const out: PreviewRow[] = raw.map((r) => {
      const base = `${r.date}|${r.amountCents}|${payeeKey(r.description)}`;
      const seq = (seen.get(base) || 0) + 1; seen.set(base, seq);
      const key = importKeyFor(acc.id, r, seq);
      const type = r.amountCents > 0 ? "income" : "expense";
      const cats = type === "income" ? data.settings.incomeCategories : data.settings.expenseCategories;
      const amount = Math.abs(r.amountCents);
      let flag: string | undefined;
      let include = true;
      if (existingKeys.has(key)) { flag = "Já importado antes"; include = false; }
      else if (type === "expense" && isInvoicePayment(r.description)) { flag = "Pagamento de fatura — as compras do cartão já são lançadas separadamente"; include = false; }
      else if (manualTx.some((t) => t.date === r.date && t.amountCents === amount && t.type === type && t.profile === acc.profile)) { flag = "Parece que você já lançou à mão"; include = false; }
      return {
        key, include, date: r.date, original: r.description, description: prettyDescription(r.description), type, amountCents: amount,
        category: guessCategory(r.description, type === "income", memory, cats), method: guessMethod(r.description, acc.method, data.settings.methods), flag,
      };
    });
    setRows(out.sort((a, b) => b.date.localeCompare(a.date)));
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    setFileName(f.name); setRows(null); setManual(null);
    if (/\.(xlsx|xls|pdf)$/i.test(f.name)) { setInfo({ format: "", warnings: ["Este formato não pode ser lido aqui. No app do banco, gere o extrato em .csv (ou .ofx) e envie de novo."] }); return; }
    let text = await f.text();
    if (text.includes("�")) { try { text = new TextDecoder("windows-1252").decode(await f.arrayBuffer()); } catch { /* mantém */ } }
    const r = parseStatement(text, f.name);
    setInfo({ format: r.format, warnings: r.warnings });
    if (!r.rows.length && r.table?.length) { setManual({ table: r.table, header: r.table[0], map: { date: 0, description: 1, amount: 2 } }); return; }
    buildPreview(r.rows);
  };

  const confirm = () => {
    if (!rows || !acc) return;
    const chosen = rows.filter((r) => r.include);
    if (!chosen.length) return;
    const stamp = nowStamp();
    update((d) => {
      let next = d;
      const memory = { ...(d.settings.importMemory || {}) };
      for (const r of chosen) {
        const t: Tx = {
          id: uid("tx"), type: r.type, description: r.description.trim() || r.original, amountCents: r.amountCents, date: r.date,
          status: "paid", paidDate: r.date, category: r.category, method: r.method, cardId: null, profile: acc.profile,
          notes: `Importado de ${acc.name}: ${r.original}`, accountId: acc.id, importKey: r.key, createdAt: stamp, updatedAt: stamp,
          ...(r.type === "income" ? { origin: r.description } : {}),
        };
        next = ops.upsertTx(next, t);
        memory[payeeKey(r.original)] = r.category;
      }
      const accounts2 = (next.settings.accounts || []).map((a) => (a.id === acc.id ? { ...a, lastImport: stamp } : a));
      return { ...next, settings: { ...next.settings, importMemory: memory, accounts: accounts2 } };
    }, `${chosen.length} lançamentos importados de ${acc.name}`);
    close();
  };

  const set = (i: number, p: Partial<PreviewRow>) => setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const chosen = rows?.filter((r) => r.include) || [];
  const tin = chosen.filter((r) => r.type === "income").reduce((s, r) => s + r.amountCents, 0);
  const tout = chosen.filter((r) => r.type === "expense").reduce((s, r) => s + r.amountCents, 0);

  if (!accounts.length) {
    return (
      <Modal title="Importar extrato" icon={<LuFileUp />} onClose={close} width={520} footer={<><Button onClick={close}>Fechar</Button><Button variant="primary" icon={<LuPlus />} onClick={() => { close(); open({ kind: "settings", tab: "contas" }); }}>Vincular uma conta</Button></>}>
        <p>Primeiro vincule a conta de onde vem o extrato (por exemplo, o Mercado Pago). Leva 10 segundos.</p>
      </Modal>
    );
  }

  return (
    <Modal title="Importar extrato" subtitle={acc ? `${acc.name} · ${PROFILE_LABEL[acc.profile]}` : undefined} icon={<LuFileUp />} onClose={close} width={rows ? 1000 : 620}
      footer={<><Button onClick={close}>Cancelar</Button>{rows && <Button variant="primary" icon={<LuCheck />} disabled={!chosen.length} onClick={confirm}>Importar {chosen.length} lançamento{chosen.length === 1 ? "" : "s"}</Button>}</>}>
      <div className="grid2">
        <Field label="Conta"><Select value={accountId} onChange={(v) => { setAccountId(v); setRows(null); setFileName(""); }} options={accounts.map((a) => ({ value: a.id, label: a.name }))} /></Field>
        <Field label="Arquivo do extrato (.csv ou .ofx)">
          <div className="row gap"><Button icon={<LuFileUp />} onClick={() => fileRef.current?.click()}>{fileName ? "Trocar arquivo" : "Escolher arquivo"}</Button><span className="small muted ellipsis">{fileName}</span></div>
          <input ref={fileRef} type="file" accept=".csv,.ofx,.txt,text/csv" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </Field>
      </div>
      {!rows && !manual && acc && <div className="note soft" style={{ marginTop: 10 }}><LuInfo /> <span><b>Como baixar:</b> {HOWTO[acc.institution] || HOWTO.default}</span></div>}
      {info && info.warnings.map((w) => <div key={w} className="note warn" style={{ marginTop: 8 }}><LuTriangleAlert /> <span>{w}</span></div>)}

      {manual && (
        <div className="import-map">
          <p className="small">Escolha as colunas do arquivo:</p>
          <div className="grid3b">
            {(["date", "description", "amount"] as const).map((k) => (
              <Field key={k} label={k === "date" ? "Data" : k === "description" ? "Descrição" : "Valor"}>
                <Select value={String(manual.map[k])} onChange={(v) => setManual({ ...manual, map: { ...manual.map, [k]: Number(v) } })} options={manual.header.map((h, i) => ({ value: String(i), label: h || `Coluna ${i + 1}` }))} />
              </Field>
            ))}
          </div>
          <Button variant="primary" onClick={() => { const r = rowsFromTable(manual.table, 0, manual.map); if (!r.rows.length) { setInfo({ format: "CSV", warnings: ["Com essas colunas não encontrei datas e valores válidos."] }); return; } setManual(null); setInfo({ format: "CSV", warnings: [] }); buildPreview(r.rows); }}>Ler o arquivo</Button>
        </div>
      )}

      {rows && (
        <>
          <div className="import-sum">
            <span><LuSparkles /> {info?.format} · {rows.length} movimentações encontradas</span>
            <span>Entradas <b className="pos">{formatBRL(tin)}</b></span>
            <span>Saídas <b className="neg">{formatBRL(tout)}</b></span>
            <button className="link small" onClick={() => setRows(rows.map((r) => ({ ...r, include: !r.flag })))}>Marcar sugeridos</button>
            <button className="link small" onClick={() => setRows(rows.map((r) => ({ ...r, include: false })))}>Desmarcar todos</button>
          </div>
          {!rows.length ? <Empty title="Nenhuma movimentação no arquivo" /> : (
            <div className="table-wrap import-table">
              <table className="table">
                <thead><tr><th></th><th>Data</th><th>Descrição</th><th>Tipo</th><th>Categoria</th><th>Forma</th><th className="right">Valor</th></tr></thead>
                <tbody>{rows.map((r, i) => (
                  <tr key={r.key} className={cls(!r.include && "excluded")}>
                    <td><input type="checkbox" checked={r.include} onChange={(e) => set(i, { include: e.target.checked })} aria-label="Importar esta linha" /></td>
                    <td className="nowrap">{formatDateBR(r.date)}</td>
                    <td><input value={r.description} onChange={(e) => set(i, { description: e.target.value })} title={r.original} />{r.flag && <div className="small warn-text">{r.flag}</div>}</td>
                    <td><span className={cls("badge", r.type === "income" ? "badge-ok" : "badge-danger")}>{r.type === "income" ? "Entrada" : "Saída"}</span></td>
                    <td><Select value={r.category} onChange={(v) => set(i, { category: v })} options={r.type === "income" ? data.settings.incomeCategories : data.settings.expenseCategories} /></td>
                    <td><Select value={r.method} onChange={(v) => set(i, { method: v })} options={data.settings.methods.filter((m) => m !== "Crédito")} /></td>
                    <td className={cls("right nowrap amount", r.type === "income" ? "pos" : "")}>{r.type === "income" ? "+" : "−"}{formatBRL(r.amountCents)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <p className="small muted">Tudo entra como pago/recebido na data do extrato, no perfil {acc ? PROFILE_LABEL[acc.profile] : ""}. As categorias que você escolher ficam memorizadas para os próximos extratos. {void toast}</p>
        </>
      )}
    </Modal>
  );
}
