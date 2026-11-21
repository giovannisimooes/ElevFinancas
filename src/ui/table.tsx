import React, { useMemo, useState } from "react";
import { LuArrowUpRight, LuArrowDownRight, LuArrowLeftRight, LuCreditCard, LuChevronDown } from "./icons";
import type { Item } from "../core/types";
import { useApp } from "./state";
import { Amount, ItemActions, ProfileTag, StatusBadge, cls, methodLabel } from "./components";
import { formatDateBR } from "../core/dates";

export type SortKey = "date" | "amount" | "category" | "description";

export function TypeIcon({ it }: { it: Item }) {
  if (it.type === "income") return <span className="ticon pos"><LuArrowUpRight /></span>;
  if (it.type === "transfer") return <span className="ticon info"><LuArrowLeftRight /></span>;
  if (it.type === "invoice") return <span className="ticon warn"><LuCreditCard /></span>;
  return <span className="ticon neg"><LuArrowDownRight /></span>;
}

export function ItemTable({ items, defaultSort = "date", defaultDir = "desc", pageSize = 50, empty, showProfile = true, compactCols }: { items: Item[]; defaultSort?: SortKey; defaultDir?: "asc" | "desc"; pageSize?: number; empty?: React.ReactNode; showProfile?: boolean; compactCols?: boolean }) {
  const { data, open } = useApp();
  const [sort, setSort] = useState<SortKey>(defaultSort);
  const [dir, setDir] = useState<"asc" | "desc">(defaultDir);
  const [limit, setLimit] = useState(pageSize);
  const sorted = useMemo(() => {
    const s = [...items];
    const m = dir === "asc" ? 1 : -1;
    s.sort((a, b) => {
      let r = 0;
      if (sort === "date") r = a.date.localeCompare(b.date) || a.description.localeCompare(b.description);
      else if (sort === "amount") r = a.amountCents - b.amountCents;
      else if (sort === "category") r = a.category.localeCompare(b.category, "pt-BR") || a.date.localeCompare(b.date);
      else r = a.description.localeCompare(b.description, "pt-BR");
      return r * m;
    });
    return s;
  }, [items, sort, dir]);
  if (!items.length) return <>{empty}</>;
  const th = (k: SortKey, label: string, className?: string) => (
    <th className={cls("sortable", className, sort === k && "on")} onClick={() => { if (sort === k) setDir(dir === "asc" ? "desc" : "asc"); else { setSort(k); setDir(k === "date" || k === "amount" ? "desc" : "asc"); } }}>
      {label}{sort === k && <span className={cls("sort-ind", dir)}><LuChevronDown /></span>}
    </th>
  );
  return (
    <div className="table-wrap">
      <table className="table cards-sm">
        <thead><tr>
          {th("date", "Data")}{th("description", "Descrição")}{th("category", "Categoria", compactCols ? "hide-md" : "")}{th("amount", "Valor", "right")}
          <th className="hide-md">Forma</th><th>Status</th>{showProfile && <th className="hide-md">Perfil</th>}<th className="right">Ações</th>
        </tr></thead>
        <tbody>
          {sorted.slice(0, limit).map((it) => (
            <tr key={it.key} onClick={() => open({ kind: "details", item: it })} className={cls(it.status === "paid" && "is-paid")}>
              <td data-l="Data" className="nowrap c-date">{formatDateBR(it.date)}</td>
              <td data-l="Descrição" className="c-desc"><div className="desc"><TypeIcon it={it} /><span className="ellipsis">{it.description}</span>{it.source === "rec" && <span className="mini-tag">mensal</span>}</div></td>
              <td data-l="Categoria" className={cls("c-cat", compactCols && "hide-md")}><span className="muted">{it.category}</span></td>
              <td data-l="Valor" className="right nowrap c-val"><Amount item={it} /></td>
              <td data-l="Forma" className="hide-md muted c-method">{methodLabel(it, data.cards)}</td>
              <td data-l="Status" className="c-status"><StatusBadge item={it} /></td>
              {showProfile && <td data-l="Perfil" className="hide-md c-prof"><ProfileTag item={it} /></td>}
              <td className="right c-act"><ItemActions item={it} compact /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length > limit && <div className="center" style={{ padding: 10 }}><button className="link" onClick={() => setLimit(limit + pageSize)}>Mostrar mais ({sorted.length - limit} restantes)</button></div>}
    </div>
  );
}
