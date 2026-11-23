// Ordenação das listas, escolhida pelo botão no topo (ao lado da engrenagem) e aplicada em todas as abas.
import React, { useEffect, useRef, useState } from "react";
import { LuArrowDownUp, LuCheck, LuArrowDown, LuArrowUp, LuRotateCcw } from "./icons";
import { useApp } from "./state";
import { Button, cls } from "./components";
import type { ListSort, ListSortKey } from "../core/types";

export const SORT_OPTIONS: { key: ListSortKey; label: string; asc: string; desc: string }[] = [
  { key: "date", label: "Data", asc: "Mais antigas primeiro", desc: "Mais recentes primeiro" },
  { key: "alpha", label: "Ordem alfabética", asc: "A → Z", desc: "Z → A" },
  { key: "amount", label: "Valor", asc: "Menor valor primeiro", desc: "Maior valor primeiro" },
  { key: "category", label: "Categoria", asc: "A → Z", desc: "Z → A" },
  { key: "type", label: "Tipo", asc: "Entradas primeiro", desc: "Saídas primeiro" },
  { key: "status", label: "Status", asc: "Atrasados e pendentes primeiro", desc: "Pagos primeiro" },
];
const DEFAULT_DIR: Record<ListSortKey, "asc" | "desc"> = { date: "desc", alpha: "asc", amount: "desc", category: "asc", type: "asc", status: "asc" };

export function useListSort(): ListSort | null {
  const { data } = useApp();
  const s = data.settings.listSort;
  return s && SORT_OPTIONS.some((o) => o.key === s.key) ? { key: s.key, dir: s.dir === "asc" ? "asc" : "desc" } : null;
}

export interface SortGetters<T> {
  date?: (x: T) => string;
  alpha: (x: T) => string;
  amount?: (x: T) => number;
  category?: (x: T) => string;
  type?: (x: T) => number;   // menor = entrada
  status?: (x: T) => number; // menor = atrasado
}

/** Ordena uma lista pela escolha global; sem escolha (ou campo indisponível), mantém a ordem recebida. */
export function sortList<T>(list: T[], sort: ListSort | null, g: SortGetters<T>): T[] {
  if (!sort) return list;
  const m = sort.dir === "asc" ? 1 : -1;
  const txt = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });
  const by: Record<ListSortKey, ((a: T, b: T) => number) | null> = {
    date: g.date ? (a, b) => g.date!(a).localeCompare(g.date!(b)) : null,
    alpha: (a, b) => txt(g.alpha(a), g.alpha(b)),
    amount: g.amount ? (a, b) => g.amount!(a) - g.amount!(b) : null,
    category: g.category ? (a, b) => txt(g.category!(a), g.category!(b)) : null,
    type: g.type ? (a, b) => g.type!(a) - g.type!(b) : null,
    status: g.status ? (a, b) => g.status!(a) - g.status!(b) : null,
  };
  const f = by[sort.key];
  if (!f) return list;
  return [...list].sort((a, b) => f(a, b) * m || txt(g.alpha(a), g.alpha(b)));
}

/** Botão do topo com o menu de ordenação. */
export function SortMenu() {
  const { data, update, toast } = useApp();
  const cur = useListSort();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, [open]);
  const set = (s: ListSort | null) => update((d) => {
    const settings = { ...d.settings };
    if (s) settings.listSort = s; else delete settings.listSort;
    return { ...d, settings };
  });
  void data;
  return (
    <div className="sort-menu" ref={ref}>
      <Button variant="ghost" icon={<LuArrowDownUp />} aria-label="Ordenar listas" title="Ordenar listas" className={cls((open || cur) && "btn-active")} onClick={() => setOpen(!open)} />
      {open && (
        <div className="popover sort-pop" role="menu">
          <strong>Ordenar as listas por</strong>
          <p className="small muted">Vale para todas as abas: lançamentos, entradas, saídas, contas fixas, parcelamentos, cartões e metas.</p>
          <ul>
            {SORT_OPTIONS.map((o) => {
              const on = cur?.key === o.key;
              return (
                <li key={o.key}>
                  <button className={cls("sort-opt", on && "on")} onClick={() => set({ key: o.key, dir: on ? cur!.dir : DEFAULT_DIR[o.key] })}>
                    <span className="sort-radio">{on && <LuCheck />}</span>
                    <span className="grow"><b>{o.label}</b><small>{on ? (cur!.dir === "asc" ? o.asc : o.desc) : (DEFAULT_DIR[o.key] === "asc" ? o.asc : o.desc)}</small></span>
                  </button>
                  {on && (
                    <button className="sort-dir" title="Inverter ordem" aria-label="Inverter ordem" onClick={() => set({ key: o.key, dir: cur!.dir === "asc" ? "desc" : "asc" })}>
                      {cur!.dir === "asc" ? <LuArrowUp /> : <LuArrowDown />}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <button className="link small" onClick={() => { set(null); toast("Cada lista voltou à ordem padrão", "info"); setOpen(false); }}><LuRotateCcw /> Ordem padrão de cada lista</button>
        </div>
      )}
    </div>
  );
}
