// Valores monetários sempre em centavos inteiros.

export type Cents = number;

const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(c: Cents): string {
  return fmt.format((c || 0) / 100);
}

export function formatBRLCompact(c: Cents): string {
  const v = Math.abs(c) / 100;
  const sign = c < 0 ? "-" : "";
  if (v >= 1_000_000) return `${sign}R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (v >= 10_000) return `${sign}R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return formatBRL(c);
}

/** Converte texto digitado ("1.234,56", "1234.56", "R$ 50", "50,5") em centavos. Retorna null se inválido. */
export function parseBRL(input: string): Cents | null {
  if (input == null) return null;
  let s = String(input).trim().replace(/R\$\s?/i, "").replace(/\s/g, "");
  if (!s) return null;
  let neg = false;
  if (s.startsWith("-")) { neg = true; s = s.slice(1); }
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let intPart: string, decPart = "";
  if (lastComma > -1 && lastComma > lastDot) {
    intPart = s.slice(0, lastComma).replace(/[.,]/g, "");
    decPart = s.slice(lastComma + 1);
  } else if (lastDot > -1 && lastComma === -1) {
    // só pontos: "1.234" (milhar) ou "12.5" (decimal)
    const parts = s.split(".");
    const last = parts[parts.length - 1];
    if (parts.length === 2 && last.length !== 3) { intPart = parts[0]; decPart = last; }
    else { intPart = parts.join(""); }
  } else if (lastDot > lastComma && lastComma > -1) {
    // formato 1,234.56
    intPart = s.slice(0, lastDot).replace(/[.,]/g, "");
    decPart = s.slice(lastDot + 1);
  } else {
    intPart = s.replace(/[.,]/g, "");
  }
  if (decPart.length > 2) return null;
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(decPart)) return null;
  const cents = parseInt(intPart || "0", 10) * 100 + parseInt((decPart + "00").slice(0, 2), 10);
  if (!Number.isSafeInteger(cents)) return null;
  return neg ? -cents : cents;
}

/** Valor para preencher um campo de edição: 1234,56 */
export function centsToInput(c: Cents | null | undefined): string {
  if (c == null) return "";
  const neg = c < 0;
  const a = Math.abs(c);
  const s = `${Math.floor(a / 100)},${String(a % 100).padStart(2, "0")}`;
  return neg ? "-" + s : s;
}

export function sum(list: Cents[]): Cents {
  let t = 0;
  for (const v of list) t += v;
  return t;
}

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return (part / total) * 100;
}

export function formatPct(p: number, digits = 1): string {
  return `${p.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}
