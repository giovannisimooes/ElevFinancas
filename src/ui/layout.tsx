// Edição de layout: ordem/nome/visibilidade das abas do menu e organização dos blocos do Dashboard
// (posição, largura, altura e visibilidade). Tudo é salvo nas configurações e sincroniza com os aparelhos.
import React, { createContext, useContext, useState } from "react";
import { LuGripVertical, LuEye, LuEyeOff, LuArrowLeft, LuArrowRight, LuRotateCcw, LuPencil, LuCheck, LuLayoutGrid, LuMinus, LuPlus } from "./icons";
import { useApp } from "./state";
import { Button, cls } from "./components";
import type { LayoutSettings, NavItemCfg, DashBlockCfg } from "../core/types";

// ---------- Blocos do Dashboard ----------
export const DASH_BLOCKS: { id: string; title: string; span: number }[] = [
  { id: "kpis", title: "Cartões de resumo", span: 12 },
  { id: "revexp", title: "Receitas x Despesas", span: 7 },
  { id: "expcat", title: "Despesas por categoria", span: 5 },
  { id: "compare", title: "Comparativo mensal", span: 4 },
  { id: "inccat", title: "Receitas por categoria", span: 4 },
  { id: "upcoming", title: "Próximos vencimentos", span: 4 },
  { id: "tabs", title: "Entradas · Débito · Crédito · Metas", span: 12 },
];
const SPANS = [3, 4, 5, 6, 7, 8, 9, 12];
const HEIGHT_FACTOR = { sm: 0.75, md: 1, lg: 1.4 } as const;

export function resolveDash(layout?: LayoutSettings): DashBlockCfg[] {
  const saved = Array.isArray(layout?.dash) ? layout!.dash! : [];
  const out: DashBlockCfg[] = [];
  for (const s of saved) { const d = DASH_BLOCKS.find((b) => b.id === s.id); if (d && !out.some((o) => o.id === s.id)) out.push({ id: s.id, span: SPANS.includes(s.span) ? s.span : d.span, height: s.height || "md", hidden: !!s.hidden }); }
  for (const d of DASH_BLOCKS) if (!out.some((o) => o.id === d.id)) out.push({ id: d.id, span: d.span, height: "md", hidden: false });
  return out;
}

export function resolveNav<T extends { id: string; label: string }>(routes: readonly T[], layout?: LayoutSettings): (T & { label: string; hidden: boolean })[] {
  const saved = Array.isArray(layout?.nav) ? layout!.nav! : [];
  const out: (T & { label: string; hidden: boolean })[] = [];
  for (const s of saved) { const r = routes.find((x) => x.id === s.id); if (r && !out.some((o) => o.id === r.id)) out.push({ ...r, label: (s.label || "").trim() || r.label, hidden: r.id === "dashboard" ? false : !!s.hidden }); }
  for (const r of routes) if (!out.some((o) => o.id === r.id)) out.push({ ...r, hidden: false });
  return out;
}

function useLayout() {
  const { data, update } = useApp();
  const layout = data.settings.layout || {};
  const save = (patch: Partial<LayoutSettings>) => update((d) => ({ ...d, settings: { ...d.settings, layout: { ...(d.settings.layout || {}), ...patch } } }));
  return { layout, save };
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const a = [...arr];
  const [x] = a.splice(from, 1);
  a.splice(Math.max(0, Math.min(a.length, to)), 0, x);
  return a;
}

// ---------- Tamanho do bloco (usado pelos gráficos) ----------
const SizeCtx = createContext(1);
export const useBlockScale = () => useContext(SizeCtx);

/** Grade do Dashboard: mostra os blocos na ordem/tamanho salvos e, no modo de edição, permite mexer neles. */
export function LayoutGrid({ blocks, after }: { blocks: Record<string, React.ReactNode>; after?: Record<string, React.ReactNode> }) {
  const { editLayout } = useApp();
  const { layout, save } = useLayout();
  const list = resolveDash(layout);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const setList = (l: DashBlockCfg[]) => save({ dash: l });
  const patch = (id: string, p: Partial<DashBlockCfg>) => setList(list.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const visible = list.filter((b) => !b.hidden);

  return (
    <div className={cls("grid-dash", editLayout && "editing-grid")}>
      {visible.map((b) => {
        const meta = DASH_BLOCKS.find((d) => d.id === b.id)!;
        const idx = list.findIndex((x) => x.id === b.id);
        const vIdx = visible.indexOf(b);
        const si = SPANS.indexOf(b.span);
        return (
          <React.Fragment key={b.id}>
            <div className={cls("block", `span-${b.span}`, editLayout && "editing", over === b.id && drag !== b.id && "drop-target", drag === b.id && "dragging")}
              draggable={editLayout}
              onDragStart={(e) => { if (!editLayout) return; setDrag(b.id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", b.id); } catch { /* ok */ } }}
              onDragOver={(e) => { if (!editLayout || !drag) return; e.preventDefault(); if (over !== b.id) setOver(b.id); }}
              onDragLeave={() => over === b.id && setOver(null)}
              onDrop={(e) => { e.preventDefault(); if (drag && drag !== b.id) { const from = list.findIndex((x) => x.id === drag); setList(move(list, from, idx)); } setDrag(null); setOver(null); }}
              onDragEnd={() => { setDrag(null); setOver(null); }}>
              <SizeCtx.Provider value={HEIGHT_FACTOR[b.height || "md"]}>{blocks[b.id]}</SizeCtx.Provider>
              {editLayout && (
                <div className="block-tools" onMouseDown={(e) => e.stopPropagation()}>
                  <span className="bt-title"><LuGripVertical /> {meta.title}</span>
                  <div className="bt-row">
                    <div className="bt-group" title="Posição">
                      <button aria-label="Mover para trás" disabled={vIdx === 0} onClick={() => { const prev = visible[vIdx - 1]; setList(move(list, idx, list.findIndex((x) => x.id === prev.id))); }}><LuArrowLeft /></button>
                      <button aria-label="Mover para frente" disabled={vIdx === visible.length - 1} onClick={() => { const nxt = visible[vIdx + 1]; setList(move(list, idx, list.findIndex((x) => x.id === nxt.id))); }}><LuArrowRight /></button>
                    </div>
                    <div className="bt-group" title="Largura">
                      <button aria-label="Diminuir largura" disabled={si <= 0} onClick={() => patch(b.id, { span: SPANS[si - 1] })}><LuMinus /></button>
                      <span className="bt-val">{Math.round((b.span / 12) * 100)}%</span>
                      <button aria-label="Aumentar largura" disabled={si >= SPANS.length - 1} onClick={() => patch(b.id, { span: SPANS[si + 1] })}><LuPlus /></button>
                    </div>
                    {b.id !== "kpis" && b.id !== "tabs" && (
                      <div className="bt-group" title="Altura">
                        {(["sm", "md", "lg"] as const).map((h) => <button key={h} aria-label={h === "sm" ? "Altura pequena" : h === "md" ? "Altura média" : "Altura grande"} title={h === "sm" ? "Altura pequena" : h === "md" ? "Altura média" : "Altura grande"} className={cls((b.height || "md") === h && "on")} onClick={() => patch(b.id, { height: h })}>{h === "sm" ? "P" : h === "md" ? "M" : "G"}</button>)}
                      </div>
                    )}
                    <div className="bt-group"><button aria-label="Ocultar bloco" title="Ocultar" onClick={() => patch(b.id, { hidden: true })}><LuEyeOff /></button></div>
                  </div>
                </div>
              )}
            </div>
            {!editLayout && after?.[b.id]}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/** Faixa do modo de edição: blocos ocultos, restaurar padrão e concluir. */
export function EditLayoutBar({ onDashboard }: { onDashboard: boolean }) {
  const { editLayout, setEditLayout, toast } = useApp();
  const { layout, save } = useLayout();
  if (!editLayout) return null;
  const hidden = resolveDash(layout).filter((b) => b.hidden);
  return (
    <div className="edit-bar">
      <div className="edit-bar-main">
        <span className="edit-bar-icon"><LuLayoutGrid /></span>
        <div className="grow minw0">
          <strong>Editando o layout</strong>
          <p className="small muted">Menu: arraste as abas, use as setas, clique no lápis para renomear e no olho para ocultar. {onDashboard ? "Blocos: arraste para mudar de lugar e ajuste largura e altura." : <>Para organizar os blocos, <a href="#dashboard" className="link">abra o Dashboard</a>.</>}</p>
        </div>
        <Button size="sm" variant="ghost" icon={<LuRotateCcw />} onClick={() => { save({ nav: [], dash: [] }); toast("Layout padrão restaurado", "info"); }}>Restaurar padrão</Button>
        <Button size="sm" variant="primary" icon={<LuCheck />} onClick={() => setEditLayout(false)}>Concluir</Button>
      </div>
      {onDashboard && hidden.length > 0 && (
        <div className="edit-hidden"><span className="small muted">Blocos ocultos:</span>
          {hidden.map((b) => <button key={b.id} className="chip" onClick={() => save({ dash: resolveDash(layout).map((x) => (x.id === b.id ? { ...x, hidden: false } : x)) })}><LuEye /> {DASH_BLOCKS.find((d) => d.id === b.id)?.title}</button>)}
        </div>
      )}
    </div>
  );
}

/** Menu de abas no modo de edição. */
export function NavEditor<T extends { id: string; label: string; icon: React.ReactNode }>({ routes }: { routes: readonly T[] }) {
  const { layout, save } = useLayout();
  const list = resolveNav(routes, layout);
  const [drag, setDrag] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [txt, setTxt] = useState("");
  const store = (l: typeof list) => save({ nav: l.map((r): NavItemCfg => ({ id: r.id, label: r.label, hidden: r.hidden })) });
  return (
    <nav className="nav nav-editing" aria-label="Editar abas">
      {list.map((r, i) => (
        <div key={r.id} className={cls("nav-edit-item", r.hidden && "is-hidden", drag === r.id && "dragging")} draggable={editing !== r.id}
          onDragStart={(e) => { setDrag(r.id); try { e.dataTransfer.setData("text/plain", r.id); } catch { /* ok */ } }}
          onDragOver={(e) => { if (drag) e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); if (drag && drag !== r.id) store(move(list, list.findIndex((x) => x.id === drag), i)); setDrag(null); }}
          onDragEnd={() => setDrag(null)}>
          <LuGripVertical className="grip" />
          {r.icon}
          {editing === r.id ? (
            <input autoFocus value={txt} onChange={(e) => setTxt(e.target.value)} maxLength={24}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(null); }}
              onBlur={() => { store(list.map((x) => (x.id === r.id ? { ...x, label: txt.trim() || routes.find((o) => o.id === r.id)!.label } : x))); setEditing(null); }} />
          ) : <span>{r.label}</span>}
          <span className="nav-edit-tools">
            <button aria-label="Mover para a esquerda" disabled={i === 0} onClick={() => store(move(list, i, i - 1))}><LuArrowLeft /></button>
            <button aria-label="Mover para a direita" disabled={i === list.length - 1} onClick={() => store(move(list, i, i + 1))}><LuArrowRight /></button>
            <button aria-label="Renomear" onClick={() => { setEditing(r.id); setTxt(r.label); }}><LuPencil /></button>
            {r.id !== "dashboard" && <button aria-label={r.hidden ? "Mostrar" : "Ocultar"} onClick={() => store(list.map((x) => (x.id === r.id ? { ...x, hidden: !x.hidden } : x)))}>{r.hidden ? <LuEyeOff /> : <LuEye />}</button>}
          </span>
        </div>
      ))}
    </nav>
  );
}
