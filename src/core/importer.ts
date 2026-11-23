// Importação de extratos bancários (CSV do Mercado Pago e de outros bancos, ou OFX).
// Detecta colunas automaticamente, sugere categoria e forma de pagamento e evita duplicados.

import type { Cents } from "./money";
import { parseBRL } from "./money";
import { type ISODate, isValidISO, pad } from "./dates";

export interface RawRow { date: ISODate; description: string; amountCents: Cents; refId?: string }
export interface ParseResult { rows: RawRow[]; format: string; warnings: string[]; header?: string[]; table?: string[][]; mapping?: ColumnMap }
export interface ColumnMap { date: number; description: number; amount: number; credit?: number; debit?: number; ref?: number }

// ---------- CSV ----------
function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
  const score = (d: string) => lines.reduce((s, l) => s + (l.split(d).length - 1), 0);
  return [";", ",", "\t", "|"].sort((a, b) => score(b) - score(a))[0];
}

export function parseCSV(text: string, delim = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x));
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const H_DATE = ["release_date", "data", "date", "data lancamento", "data do lancamento", "data da transacao", "data movimento", "dt", "data_lancamento"];
const H_DESC = ["transaction_type", "descricao", "description", "historico", "lancamento", "detalhes", "titulo", "memo", "estabelecimento", "descricao do lancamento"];
const H_AMOUNT = ["transaction_net_amount", "valor", "amount", "valor (r$)", "valor r$", "montante", "value", "net_amount", "valor_liquido"];
const H_CREDIT = ["credito", "entrada", "entradas", "credit"];
const H_DEBIT = ["debito", "saida", "saidas", "debit"];
const H_REF = ["reference_id", "id", "identificador", "codigo", "id da transacao", "id_transacao"];

function findCol(header: string[], names: string[]): number {
  const h = header.map(norm);
  let i = h.findIndex((x) => names.includes(x));
  if (i < 0) i = h.findIndex((x) => names.some((n) => n.length > 3 && x.includes(n)));
  return i;
}

export function parseDateLoose(s: string): ISODate | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) { const iso = `${m[1]}-${m[2]}-${m[3]}`; return isValidISO(iso) ? iso : null; }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(t);
  if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; const iso = `${y}-${pad(+m[2])}-${pad(+m[1])}`; return isValidISO(iso) ? iso : null; }
  m = /^(\d{4})(\d{2})(\d{2})/.exec(t);
  if (m) { const iso = `${m[1]}-${m[2]}-${m[3]}`; return isValidISO(iso) ? iso : null; }
  return null;
}

export function parseAmountLoose(s: string): Cents | null {
  let t = s.replace(/R\$\s?/gi, "").replace(/\s/g, "").replace(/−/g, "-");
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (t.endsWith("-")) { neg = true; t = t.slice(0, -1); }
  if (t.startsWith("+")) t = t.slice(1);
  const c = parseBRL(t);
  if (c == null) return null;
  return neg ? -Math.abs(c) : c;
}

/** Tenta descobrir as colunas a partir de uma tabela. */
export function autoMap(table: string[][]): { headerRow: number; map: ColumnMap | null } {
  for (let r = 0; r < Math.min(table.length, 40); r++) {
    const h = table[r];
    const date = findCol(h, H_DATE);
    const amount = findCol(h, H_AMOUNT);
    const credit = findCol(h, H_CREDIT), debit = findCol(h, H_DEBIT);
    if (date >= 0 && (amount >= 0 || (credit >= 0 && debit >= 0))) {
      let desc = findCol(h, H_DESC);
      if (desc < 0) desc = h.findIndex((_, i) => i !== date && i !== amount && i !== credit && i !== debit);
      const ref = findCol(h, H_REF);
      return { headerRow: r, map: { date, description: desc, amount, credit: credit >= 0 ? credit : undefined, debit: debit >= 0 ? debit : undefined, ref: ref >= 0 && ref !== date && ref !== amount ? ref : undefined } };
    }
  }
  return { headerRow: 0, map: null };
}

export function rowsFromTable(table: string[][], headerRow: number, map: ColumnMap): { rows: RawRow[]; skipped: number } {
  const rows: RawRow[] = [];
  let skipped = 0;
  for (const r of table.slice(headerRow + 1)) {
    const date = parseDateLoose(r[map.date] || "");
    let amount: Cents | null = null;
    if (map.amount >= 0 && r[map.amount] != null && r[map.amount] !== "") amount = parseAmountLoose(r[map.amount]);
    else if (map.credit != null || map.debit != null) {
      const c = map.credit != null ? parseAmountLoose(r[map.credit] || "") : null;
      const d = map.debit != null ? parseAmountLoose(r[map.debit] || "") : null;
      if (c) amount = Math.abs(c); else if (d) amount = -Math.abs(d);
    }
    const description = (r[map.description] || "").replace(/\s+/g, " ").trim();
    if (!date || amount == null || amount === 0) { skipped++; continue; }
    rows.push({ date, description: description || "(sem descrição)", amountCents: amount, refId: map.ref != null ? r[map.ref] || undefined : undefined });
  }
  return { rows, skipped };
}

// ---------- OFX ----------
export function parseOFX(text: string): RawRow[] {
  const out: RawRow[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const tag = (b: string, t: string) => { const m = new RegExp(`<${t}>([^<\\r\\n]*)`, "i").exec(b); return m ? m[1].trim() : ""; };
  for (const b of blocks) {
    const date = parseDateLoose(tag(b, "DTPOSTED"));
    const amt = tag(b, "TRNAMT");
    const cents = amt ? Math.round(parseFloat(amt.replace(",", ".")) * 100) : NaN;
    if (!date || !Number.isFinite(cents) || cents === 0) continue;
    out.push({ date, amountCents: cents, description: tag(b, "MEMO") || tag(b, "NAME") || "(sem descrição)", refId: tag(b, "FITID") || undefined });
  }
  return out;
}

export function parseStatement(text: string, fileName = ""): ParseResult {
  const clean = text.replace(/^﻿/, "");
  if (/<OFX>|OFXHEADER/i.test(clean) || /\.ofx$/i.test(fileName)) {
    const rows = parseOFX(clean);
    return { rows, format: "OFX", warnings: rows.length ? [] : ["Nenhuma movimentação encontrada no arquivo OFX."] };
  }
  const table = parseCSV(clean);
  const { headerRow, map } = autoMap(table);
  if (!map) return { rows: [], format: "CSV", warnings: ["Não reconheci as colunas automaticamente. Escolha abaixo qual coluna é a data, a descrição e o valor."], table, header: table[0] };
  const { rows, skipped } = rowsFromTable(table, headerRow, map);
  const isMP = table[headerRow].map(norm).includes("transaction_net_amount");
  const warnings = skipped ? [`${skipped} linha(s) sem data ou valor foram ignoradas.`] : [];
  return { rows, format: isMP ? "Extrato Mercado Pago (CSV)" : "CSV", warnings, table, header: table[headerRow], mapping: map };
}

// ---------- Sugestões ----------
const PREFIXES = [
  "pagamento com qr pix", "pagamento com codigo qr pix", "pagamento qr pix", "transferencia pix enviada", "transferencia pix recebida", "transferencia enviada",
  "transferencia recebida", "pix enviado", "pix recebido", "pagamento com pix", "pagamento de conta", "pagamento com cartao de debito", "compra no debito", "compra com cartao",
  "pagamento", "compra", "pix", "transferencia", "rendimentos", "rendimento",
];

/** Nome "limpo" do estabelecimento/pessoa, usado para lembrar a categoria escolhida. */
export function payeeKey(desc: string): string {
  let d = norm(desc).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  for (const p of PREFIXES) if (d.startsWith(p + " ")) { d = d.slice(p.length).trim(); break; }
  d = d.replace(/\b\d[\d ]*\b/g, " ").replace(/\s+/g, " ").trim();
  return d.split(" ").slice(0, 3).join(" ") || norm(desc).slice(0, 30);
}

const KEYWORDS: [RegExp, string[]][] = [
  [/fatura/, ["__fatura__"]],
  [/shopee|mercado ?livre|amazon|magalu|magazine|americanas|aliexpress|shein/, ["Compras"]],
  [/supermerc|mercado(?! ?(pago|livre))|atacad|assai|carrefour|hortifruti|sacolao|padaria/, ["Supermercado", "Alimentação"]],
  [/posto|combust|gasolina|shell|ipiranga|petrobras|\bbr mania/, ["Combustível", "Transporte"]],
  [/farmac|drogar|droga |raia|pacheco|pague menos/, ["Farmácia", "Saúde"]],
  [/ifood|restaurante|lanche|lanchonete|pizza|burger|bar |cafe|acai|rappi|food/, ["Alimentação"]],
  [/uber|99 ?app|99pop|taxi|onibus|metro|estacionamento|pedagio|sem parar/, ["Transporte"]],
  [/spotify|netflix|disney|prime video|amazon prime|youtube|deezer|hbo|max\b|globoplay|apple|icloud|google one/, ["Assinaturas"]],
  [/claude|anthropic|openai|chatgpt|canva|adobe|figma|notion|capcut|microsoft|google ?workspace|hostinger|github/, ["Ferramentas / Software", "Assinaturas"]],
  [/energia|enel|cemig|light|copel|celesc|equatorial|neoenergia|agua|saneago|sabesp|copasa|internet|vivo|claro|\btim\b|oi |net |telefon/, ["Energia / Água / Internet", "Moradia"]],
  [/aluguel|condominio|imobiliaria/, ["Moradia"]],
  [/loja/, ["Compras"]],
  [/academia|smartfit|medic|clinica|hospital|laborat|dentist|plano de saude|unimed/, ["Saúde"]],
  [/escola|curso|faculdade|udemy|hotmart|alura/, ["Educação"]],
  [/cinema|show|ingresso|steam|playstation|xbox|viagem|hotel|airbnb/, ["Lazer"]],
  [/imposto|das |simples nacional|darf|iptu|ipva|inss/, ["Impostos"]],
  [/meta ads|facebook|instagram|google ads|anuncio|tiktok ads/, ["Marketing"]],
  [/rendiment|cashback/, ["Rendimentos"]],
  [/salario|pro labore|pro-labore/, ["Pró-labore / Salário"]],
  [/comiss|afiliad/, ["Comissões de afiliado"]],
];

export function guessCategory(desc: string, isIncome: boolean, memory: Record<string, string>, cats: string[]): string {
  const key = payeeKey(desc);
  if (memory[key] && cats.includes(memory[key])) return memory[key];
  const d = norm(desc);
  if (isInvoicePayment(desc)) return cats.includes("Outros") ? "Outros" : cats[0];
  for (const [re, opts] of KEYWORDS) {
    if (!re.test(d)) continue;
    for (const o of opts) if (cats.includes(o)) return o;
  }
  if (isIncome) return cats.find((c) => /client|servi/i.test(c)) || cats.find((c) => c === "Outros") || cats[0] || "Outros";
  return cats.includes("Outros") ? "Outros" : cats[0] || "Outros";
}

export function guessMethod(desc: string, fallback: string, methods: string[]): string {
  const d = norm(desc);
  const pick = (m: string) => (methods.includes(m) ? m : fallback);
  if (/\bpix\b|qr/.test(d)) return pick("Pix");
  if (/transfer|\bted\b|\bdoc\b/.test(d)) return pick("Transferência");
  if (/boleto|pagamento de conta/.test(d)) return pick("Boleto");
  if (/debito|cartao/.test(d)) return pick("Débito");
  if (/saque|dinheiro/.test(d)) return pick("Dinheiro");
  return fallback;
}

export function isInvoicePayment(desc: string): boolean { return /fatura/.test(norm(desc)); }

/** Descrição mais legível: tira o prefixo genérico ("Pagamento com QR Pix") quando houver nome depois. */
export function prettyDescription(desc: string): string {
  const d = desc.replace(/\s+/g, " ").trim();
  const n = norm(d);
  if (isInvoicePayment(d)) return d.length > 80 ? d.slice(0, 80) : d;
  for (const p of PREFIXES) {
    if (n.startsWith(p + " ") && d.length > p.length + 2) {
      const rest = d.slice(p.length).trim();
      if (rest.length >= 3) return rest.length > 60 ? rest.slice(0, 60) : rest;
    }
  }
  return d.length > 80 ? d.slice(0, 80) : d;
}

/** Chave estável para não importar a mesma movimentação duas vezes. */
export function importKeyFor(accountId: string, r: RawRow, seq: number): string {
  if (r.refId) return `${accountId}|ref:${r.refId}`;
  return `${accountId}|${r.date}|${r.amountCents}|${payeeKey(r.description)}|${seq}`;
}
