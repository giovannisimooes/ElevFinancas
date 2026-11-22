import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AppData, Item, ProfileView, Tx, Recurring, InstallmentPlan, Card, Goal, TrashItem } from "../core/types";
import { emptyData, nowStamp } from "../core/types";
import { buildItems, horizonFor, earliestMonth } from "../core/engine";
import { type MonthKey, monthOf, todayISO, type ISODate } from "../core/dates";
import { Store, type StorageStatus, isEmptyData, diffData, applyChanges, type Change } from "../core/storage";
import { demoData } from "./demo";

export type ModalSpec =
  | { kind: "new" }
  | { kind: "tx"; txType: "income" | "expense" | "transfer"; id?: string; preset?: Partial<Tx> }
  | { kind: "recurring"; id?: string; recKind?: "income" | "expense" }
  | { kind: "occurrence"; recId: string; month: MonthKey }
  | { kind: "installment"; id?: string }
  | { kind: "goal"; id?: string }
  | { kind: "goalEntry"; goalId: string }
  | { kind: "card"; id?: string }
  | { kind: "pay"; item: Item }
  | { kind: "details"; item: Item }
  | { kind: "delete"; item: Item }
  | { kind: "settings"; tab?: string }
  | { kind: "confirm"; title: string; message: string; danger?: boolean; confirmLabel?: string; onConfirm: () => void };

export interface Toast { id: number; text: string; tone?: "ok" | "err" | "info"; undo?: boolean }

interface Ctx {
  ready: boolean;
  data: AppData;
  items: Item[];
  view: ProfileView; setView: (v: ProfileView) => void;
  month: MonthKey; setMonth: (m: MonthKey) => void;
  today: ISODate;
  status: StorageStatus;
  demo: boolean; setDemo: (v: boolean) => void;
  store: Store | null;
  update: (fn: (d: AppData) => AppData, msg?: string) => void;
  replaceAll: (d: AppData, msg?: string) => void;
  undo: () => void; canUndo: boolean;
  modals: ModalSpec[]; open: (m: ModalSpec) => void; close: () => void;
  toasts: Toast[]; toast: (text: string, tone?: Toast["tone"], undo?: boolean) => void;
  minMonth: MonthKey;
  editLayout: boolean; setEditLayout: (v: boolean) => void;
}

const C = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(C);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [real, setReal] = useState<AppData>(emptyData());
  const [demoState, setDemoState] = useState<AppData | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<StorageStatus>({ mode: "connecting", save: "idle", lastSavedAt: null, lastSyncAt: null, message: "Conectando…", verified: false });
  const [view, setViewRaw] = useState<ProfileView>("geral");
  const [today, setToday] = useState(todayISO());
  const [month, setMonth] = useState<MonthKey>(monthOf(todayISO()));
  const [modals, setModals] = useState<ModalSpec[]>([]);
  const [editLayout, setEditLayout] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const history = useRef<Change[][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const storeRef = useRef<Store | null>(null);
  const realRef = useRef(real);
  realRef.current = real;

  useEffect(() => {
    const store = new Store(setStatus, (remote) => { realRef.current = remote; setReal(remote); });
    storeRef.current = store;
    store.init().then((d) => {
      realRef.current = d;
      setReal(d);
      setViewRaw(d.settings.defaultProfile || "geral");
      setReady(true);
    });
    const t = setInterval(() => setToday(todayISO()), 60000);
    const before = (e: BeforeUnloadEvent) => { if (store.hasUnsaved()) { e.preventDefault(); } };
    window.addEventListener("beforeunload", before);
    return () => { clearInterval(t); window.removeEventListener("beforeunload", before); };
  }, []);

  const demo = demoState !== null;
  const data = demoState ?? real;

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok", undo = false) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-1), { id, text, tone, undo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), undo ? 6000 : 3500);
  }, []);

  // Cada ação guarda só os registros que alterou: o "Desfazer" reverte apenas esses registros,
  // sem apagar o que chegou de outro dispositivo nesse meio-tempo.
  const commit = useCallback((next: AppData, prev: AppData) => {
    const changes = diffData(prev, next);
    if (!changes.length) return;
    history.current = [...history.current.slice(-19), changes];
    setCanUndo(true);
    if (demoState !== null) { setDemoState(next); return; }
    realRef.current = next;
    setReal(next);
    storeRef.current?.save(changes, next);
  }, [demoState]);

  const update = useCallback((fn: (d: AppData) => AppData, msg?: string) => {
    const prev = demoState ?? realRef.current;
    const next = fn(prev);
    if (next === prev) return;
    commit(next, prev);
    if (msg) toast(msg, "ok", true);
  }, [commit, demoState, toast]);

  const replaceAll = useCallback((d: AppData, msg?: string) => {
    const prev = demoState ?? realRef.current;
    commit(d, prev);
    if (msg) toast(msg, "ok", true);
  }, [commit, demoState, toast]);

  const undo = useCallback(() => {
    const changes = history.current.pop();
    setCanUndo(history.current.length > 0);
    if (!changes) return;
    if (demoState !== null) { setDemoState(applyChanges(demoState, changes, true)); return; }
    const cur = realRef.current;
    const next = applyChanges(cur, changes, true);
    realRef.current = next;
    setReal(next);
    storeRef.current?.save(diffData(cur, next), next);
    toast("Ação desfeita", "info");
  }, [demoState, toast]);

  const setView = useCallback((v: ProfileView) => setViewRaw(v), []);
  const setDemo = useCallback((v: boolean) => {
    history.current = []; setCanUndo(false);
    setDemoState(v ? demoData(todayISO()) : null);
  }, []);

  const horizon = horizonFor(month, today);
  const items = useMemo(() => buildItems(data, horizon), [data, horizon]);
  const minMonth = useMemo(() => earliestMonth(data, monthOf(today)), [data, today]);

  const open = useCallback((m: ModalSpec) => setModals((s) => [...s, m]), []);
  const close = useCallback(() => setModals((s) => s.slice(0, -1)), []);

  // aplica tema
  useEffect(() => {
    const s = data.settings;
    const root = document.documentElement;
    root.dataset.theme = s.theme;
    root.style.setProperty("--p", s.primary);
    root.dataset.compact = s.compact ? "1" : "0";
    root.dataset.anim = s.chartStyle.animate ? "1" : "0";
  }, [data.settings]);

  const value: Ctx = {
    ready, data, items, view, setView, month, setMonth, today, status, demo, setDemo, store: storeRef.current,
    update, replaceAll, undo, canUndo, modals, open, close, toasts, toast, minMonth, editLayout, setEditLayout,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}

// ---------- operações de dados (puras) ----------

export function trashPush(d: AppData, kind: string, record: unknown, label: string): TrashItem[] {
  return [{ id: (record as { id: string }).id, kind, record, label, deletedAt: nowStamp() }, ...d.trash].slice(0, 300);
}

export const ops = {
  upsertTx(d: AppData, t: Tx): AppData { return { ...d, txs: { ...d.txs, [t.id]: { ...t, updatedAt: nowStamp() } } }; },
  upsertRec(d: AppData, r: Recurring): AppData { return { ...d, recurring: { ...d.recurring, [r.id]: { ...r, updatedAt: nowStamp() } } }; },
  upsertInst(d: AppData, p: InstallmentPlan): AppData { return { ...d, installments: { ...d.installments, [p.id]: { ...p, updatedAt: nowStamp() } } }; },
  upsertCard(d: AppData, c: Card): AppData { return { ...d, cards: { ...d.cards, [c.id]: { ...c, updatedAt: nowStamp() } } }; },
  upsertGoal(d: AppData, g: Goal): AppData { return { ...d, goals: { ...d.goals, [g.id]: { ...g, updatedAt: nowStamp() } } }; },
  remove(d: AppData, section: "txs" | "recurring" | "installments" | "cards" | "goals", id: string, label: string): AppData {
    const rec = (d[section] as Record<string, unknown>)[id];
    if (!rec) return d;
    const copy = { ...(d[section] as Record<string, unknown>) };
    delete copy[id];
    return { ...d, [section]: copy, trash: trashPush(d, section, rec, label) } as AppData;
  },
  restore(d: AppData, trashId: string, deletedAt: string): AppData {
    const t = d.trash.find((x) => x.id === trashId && x.deletedAt === deletedAt);
    if (!t) return d;
    const section = t.kind as "txs";
    const cur = (d[section] || {}) as Record<string, unknown>;
    const rec = t.record as { id: string };
    return { ...d, [section]: { ...cur, [rec.id]: rec }, trash: d.trash.filter((x) => x !== t) } as AppData;
  },

  /** Marca qualquer item como pago/recebido, na data informada. */
  pay(d: AppData, it: Item, date: ISODate, amount?: number): AppData {
    if (it.source === "tx") {
      const t = d.txs[it.refId]; if (!t) return d;
      return ops.upsertTx(d, { ...t, status: "paid", paidDate: date });
    }
    if (it.source === "rec") {
      const r = d.recurring[it.refId]; if (!r) return d;
      const occ = { ...(r.occurrences[it.occ!] || {}) } as Record<string, unknown>;
      if (occ.amountCents === undefined) { occ.amountCents = it.amountCents; occ.amountFromPay = true; }
      occ.status = "paid"; occ.paidDate = date;
      return ops.upsertRec(d, { ...r, occurrences: { ...r.occurrences, [it.occ!]: occ } });
    }
    if (it.source === "inst") {
      const p = d.installments[it.refId]; if (!p) return d;
      return ops.upsertInst(d, { ...p, payments: { ...p.payments, [it.occ!]: { paidDate: date } } });
    }
    if (it.source === "invoice") {
      const c = d.cards[it.refId]; if (!c) return d;
      return ops.upsertCard(d, { ...c, invoices: { ...c.invoices, [it.occ!]: { paidDate: date, amountCents: amount ?? it.amountCents } } });
    }
    return d;
  },

  unpay(d: AppData, it: Item): AppData {
    if (it.source === "tx") {
      const t = d.txs[it.refId]; if (!t) return d;
      return ops.upsertTx(d, { ...t, status: "pending", paidDate: null });
    }
    if (it.source === "rec") {
      const r = d.recurring[it.refId]; if (!r) return d;
      const occ = { ...(r.occurrences[it.occ!] || {}) } as Record<string, unknown>;
      delete occ.status; delete occ.paidDate;
      if (occ.amountFromPay) { delete occ.amountCents; delete occ.amountFromPay; }
      const occs = { ...r.occurrences } as Record<string, unknown>;
      if (Object.keys(occ).length) occs[it.occ!] = occ; else delete occs[it.occ!];
      return ops.upsertRec(d, { ...r, occurrences: occs as Recurring["occurrences"] });
    }
    if (it.source === "inst") {
      const p = d.installments[it.refId]; if (!p) return d;
      const pay = { ...p.payments }; delete pay[it.occ!];
      return ops.upsertInst(d, { ...p, payments: pay });
    }
    if (it.source === "invoice") {
      const c = d.cards[it.refId]; if (!c) return d;
      const inv = { ...c.invoices }; delete inv[it.occ!];
      return ops.upsertCard(d, { ...c, invoices: inv });
    }
    return d;
  },
};

export { isEmptyData };
