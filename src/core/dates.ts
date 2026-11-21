// Datas como strings ISO locais "AAAA-MM-DD" e meses como "AAAA-MM". Nada de fuso horário.

export type ISODate = string; // 2026-11-21
export type MonthKey = string; // 2026-11

export function pad(n: number): string { return String(n).padStart(2, "0"); }

export function todayISO(): ISODate {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isLeap(y: number): boolean { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

export function daysInMonth(y: number, m: number): number { // m 1..12
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

export function parseISO(d: ISODate): { y: number; m: number; d: number } {
  const [y, m, dd] = d.split("-").map(Number);
  return { y, m, d: dd };
}

export function isValidISO(s: unknown): s is ISODate {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parseISO(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function isValidMonth(s: unknown): s is MonthKey {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function monthOf(d: ISODate): MonthKey { return d.slice(0, 7); }

export function monthParts(mk: MonthKey): { y: number; m: number } {
  const [y, m] = mk.split("-").map(Number);
  return { y, m };
}

export function makeMonth(y: number, m: number): MonthKey {
  // normaliza meses fora de 1..12
  const idx = y * 12 + (m - 1);
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12 + 12) % 12 + 1;
  return `${ny}-${pad(nm)}`;
}

export function addMonths(mk: MonthKey, n: number): MonthKey {
  const { y, m } = monthParts(mk);
  return makeMonth(y, m + n);
}

export function monthDiff(a: MonthKey, b: MonthKey): number { // b - a
  const pa = monthParts(a), pb = monthParts(b);
  return (pb.y - pa.y) * 12 + (pb.m - pa.m);
}

/** Data com dia limitado ao último dia do mês (vencimento dia 31 em fevereiro → 28/29). */
export function dateInMonth(mk: MonthKey, day: number): ISODate {
  const { y, m } = monthParts(mk);
  const d = Math.min(Math.max(1, Math.floor(day)), daysInMonth(y, m));
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function firstDay(mk: MonthKey): ISODate { return `${mk}-01`; }
export function lastDay(mk: MonthKey): ISODate { const { y, m } = monthParts(mk); return `${mk}-${pad(daysInMonth(y, m))}`; }

export function addDays(d: ISODate, n: number): ISODate {
  const { y, m, d: dd } = parseISO(d);
  const dt = new Date(Date.UTC(y, m - 1, dd + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function daysBetween(a: ISODate, b: ISODate): number { // b - a em dias
  const pa = parseISO(a), pb = parseISO(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

export function weekday(d: ISODate): number { // 0 domingo
  const { y, m, d: dd } = parseISO(d);
  return new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function formatDateBR(d: ISODate | null | undefined): string {
  if (!d) return "—";
  const { y, m, d: dd } = parseISO(d);
  return `${pad(dd)}/${pad(m)}/${y}`;
}

export function formatDateShort(d: ISODate): string {
  const { m, d: dd } = parseISO(d);
  return `${pad(dd)}/${pad(m)}`;
}

export function monthLabel(mk: MonthKey): string {
  const { y, m } = monthParts(mk);
  return `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}`;
}

export function monthShort(mk: MonthKey): string {
  const { y, m } = monthParts(mk);
  return `${MONTHS_SHORT[m - 1]}/${String(y).slice(2)}`;
}

export const MONTH_NAMES = MONTHS;

/** Converte "21/11/2026" em ISO; aceita também ISO. */
export function parseBRDate(s: string): ISODate | null {
  const t = s.trim();
  if (isValidISO(t)) return t;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return null;
  const iso = `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  return isValidISO(iso) ? iso : null;
}
