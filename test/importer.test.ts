import assert from "node:assert/strict";
import { parseStatement, guessCategory, payeeKey, prettyDescription, guessMethod } from "../src/core/importer";
import { defaultSettings } from "../src/core/types";
const s = defaultSettings();
const mp = `INITIAL_BALANCE;CREDITS;DEBITS;FINAL_BALANCE
1.000,00;5.300,00;-1.250,90;5.049,10

RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE
01-11-2026;Transferência Pix recebida Central Parafusos;9001;550,00;1.550,00
03-11-2026;Pagamento com QR Pix SUPERMERCADO BOM PRECO;9002;-1,00;1.549,00
05-11-2026;Pagamento com QR Pix POSTO SHELL 123;9003;-120,50;1.428,50
07-11-2026;Transferência Pix enviada Maria Silva;9004;-80,00;1.348,50
10-11-2026;Pagamento de fatura do cartão Mercado Pago;9005;-950,40;398,10
12-11-2026;Rendimentos;9006;1,23;399,33
`;
const r = parseStatement(mp, "extrato.csv");
assert.equal(r.format, "Extrato Mercado Pago (CSV)");
assert.equal(r.rows.length, 6);
assert.deepEqual(r.rows[1], { date: "2026-11-03", description: "Pagamento com QR Pix SUPERMERCADO BOM PRECO", amountCents: -100, refId: "9002" });
assert.equal(guessCategory(r.rows[1].description, false, {}, s.expenseCategories), "Supermercado");
assert.equal(guessCategory(r.rows[2].description, false, {}, s.expenseCategories), "Combustível");
assert.equal(guessMethod(r.rows[3].description, "Pix", s.methods), "Pix");
assert.equal(prettyDescription(r.rows[1].description), "SUPERMERCADO BOM PRECO");
assert.equal(payeeKey(r.rows[2].description), "posto shell");
assert.equal(guessCategory("Pix enviado POSTO SHELL 999", false, { "posto shell": "Transporte" }, s.expenseCategories), "Transporte");
const nb = `Data,Valor,Identificador,Descrição\n2026-11-05,-35.90,abc,Compra no débito - Spotify\n2026-11-06,1500.00,def,Transferência recebida pelo Pix - Fulano`;
const r2 = parseStatement(nb, "nubank.csv");
assert.equal(r2.rows.length, 2); assert.equal(r2.rows[0].amountCents, -3590); assert.equal(r2.rows[1].amountCents, 150000);
assert.equal(guessCategory(r2.rows[0].description, false, {}, s.expenseCategories), "Assinaturas");
const ofx = `OFXHEADER:100\n<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261108120000[-3:BRT]<TRNAMT>-45.10<FITID>X1<MEMO>FARMACIA PAGUE MENOS</STMTTRN></BANKTRANLIST></OFX>`;
const r3 = parseStatement(ofx, "b.ofx");
assert.deepEqual(r3.rows[0], { date: "2026-11-08", amountCents: -4510, description: "FARMACIA PAGUE MENOS", refId: "X1" });
const deb = `Data;Histórico;Crédito;Débito\n09/11/2026;Padaria Pão Quente;;12,50\n10/11/2026;Salário;3.000,00;`;
const r4 = parseStatement(deb);
assert.equal(r4.rows[0].amountCents, -1250); assert.equal(r4.rows[1].amountCents, 300000);
console.log("importador: ok");
