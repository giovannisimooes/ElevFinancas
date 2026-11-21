// Exportação CSV e PDF sem dependências externas.

export function toCSV(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // ";" é o separador padrão do Excel em português; BOM para acentos.
  return "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
}

export interface PdfTable { heading: string; columns: string[]; widths: number[]; align?: ("l" | "r")[]; rows: string[][]; }
export interface PdfDoc { title: string; subtitle: string; summary?: [string, string][]; tables: PdfTable[]; color?: string }

const W: Record<string, number> = { " ": 278, ",": 278, ".": 278, "-": 333, "/": 278, "%": 889, "$": 556, "(": 333, ")": 333, ":": 278 };
function charW(ch: string, bold: boolean): number {
  if (W[ch]) return W[ch];
  if (/[0-9]/.test(ch)) return 556;
  if (/[A-Z]/.test(ch)) return bold ? 722 : 667;
  if (/[il]/.test(ch)) return 222;
  if (/[mw]/.test(ch)) return 833;
  return bold ? 611 : 556;
}
function textWidth(s: string, size: number, bold = false) { let w = 0; for (const c of s) w += charW(c, bold); return (w / 1000) * size; }

function latin1(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c === 0x2014 || c === 0x2013) out += "-";
    else if (c === 0x2022) out += "\x95";
    else if (c < 256) out += ch;
    else out += "?";
  }
  return out.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function fit(s: string, maxW: number, size: number, bold = false): string {
  if (textWidth(s, size, bold) <= maxW) return s;
  let t = s;
  while (t.length > 1 && textWidth(t + "…", size, bold) > maxW) t = t.slice(0, -1);
  return t + "...";
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function buildPDF(doc: PdfDoc): Uint8Array {
  const PW = 595, PH = 842, M = 40;
  const pages: string[] = [];
  let ops: string[] = [];
  let y = PH - M;
  const [cr, cg, cb] = hexToRgb(doc.color || "#12A150");
  const text = (x: number, yy: number, s: string, size = 9, bold = false, rgb: [number, number, number] = [0.1, 0.1, 0.12]) =>
    ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${rgb.join(" ")} rg ${x.toFixed(1)} ${yy.toFixed(1)} Td (${latin1(s)}) Tj ET`);
  const rect = (x: number, yy: number, w: number, h: number, rgb: [number, number, number]) => ops.push(`${rgb.join(" ")} rg ${x} ${yy} ${w} ${h} re f`);
  const newPage = () => { if (ops.length) pages.push(ops.join("\n")); ops = []; y = PH - M; };
  const ensure = (h: number) => { if (y - h < M + 20) { newPage(); } };

  // Cabeçalho
  rect(0, PH - 70, PW, 70, [cr, cg, cb]);
  text(M, PH - 38, doc.title, 18, true, [1, 1, 1]);
  text(M, PH - 56, doc.subtitle, 10, false, [1, 1, 1]);
  y = PH - 95;

  if (doc.summary?.length) {
    const colW = (PW - 2 * M) / 3;
    doc.summary.forEach(([k, v], i) => {
      const col = i % 3;
      if (col === 0 && i > 0) y -= 40;
      const x = M + col * colW;
      rect(x, y - 30, colW - 8, 36, [0.95, 0.97, 0.96]);
      text(x + 8, y - 6, k, 8, false, [0.4, 0.43, 0.45]);
      text(x + 8, y - 22, v, 12, true);
    });
    y -= 52;
  }

  for (const t of doc.tables) {
    ensure(50);
    text(M, y, t.heading, 12, true, [cr * 0.7, cg * 0.7, cb * 0.7]);
    y -= 16;
    const total = t.widths.reduce((a, b) => a + b, 0);
    const ws = t.widths.map((w) => (w / total) * (PW - 2 * M));
    const header = () => {
      rect(M, y - 5, PW - 2 * M, 16, [cr, cg, cb]);
      let x = M;
      t.columns.forEach((c, i) => {
        const al = t.align?.[i] || "l";
        const s = fit(c, ws[i] - 8, 8, true);
        text(al === "r" ? x + ws[i] - 4 - textWidth(s, 8, true) : x + 4, y, s, 8, true, [1, 1, 1]);
        x += ws[i];
      });
      y -= 16;
    };
    header();
    if (!t.rows.length) { text(M + 4, y, "Sem registros no período.", 9, false, [0.45, 0.45, 0.45]); y -= 14; }
    t.rows.forEach((r, ri) => {
      if (y < M + 30) { newPage(); header(); }
      if (ri % 2 === 1) rect(M, y - 4, PW - 2 * M, 14, [0.96, 0.97, 0.97]);
      let x = M;
      r.forEach((c, i) => {
        const al = t.align?.[i] || "l";
        const s = fit(c, ws[i] - 8, 8.5);
        text(al === "r" ? x + ws[i] - 4 - textWidth(s, 8.5) : x + 4, y, s, 8.5);
        x += ws[i];
      });
      y -= 14;
    });
    y -= 14;
  }
  newPage();

  // Montagem do arquivo
  const objs: string[] = [];
  const add = (s: string) => { objs.push(s); return objs.length; };
  const catalog = add("");
  const pagesObj = add("");
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  pages.forEach((content, i) => {
    const footer = `BT /F1 8 Tf 0.5 0.5 0.5 rg ${M} 24 Td (${latin1(`ELEV FINANCE - página ${i + 1} de ${pages.length}`)}) Tj ET`;
    const stream = content + "\n" + footer;
    const c = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PW} ${PH}] /Contents ${c} 0 R /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> >>`));
  });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return bytes;
}
