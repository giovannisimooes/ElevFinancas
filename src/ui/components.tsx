import React, { useEffect, useId, useRef, useState } from "react";
import { LuX, LuCheck, LuUndo2, LuPencil, LuTrash2, LuEye, LuRotateCcw } from "react-icons/lu";
import { parseBRL, centsToInput, formatBRL } from "../core/money";
import type { Item } from "../core/types";
import { PROFILE_LABEL } from "../core/types";
import { dueState, CREDIT } from "../core/engine";
import { formatDateBR, todayISO } from "../core/dates";
import { useApp } from "./state";

export function cls(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(" "); }

export function Button({ variant = "default", size, icon, children, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "default" | "ghost" | "danger" | "soft"; size?: "sm" | "xs"; icon?: React.ReactNode }) {
  return <button type="button" className={cls("btn", `btn-${variant}`, size && `btn-${size}`, !children && "btn-icon", className)} {...rest}>{icon}{children && <span>{children}</span>}</button>;
}

export function Modal({ title, subtitle, onClose, children, footer, width = 560, icon }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; width?: number; icon?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    const first = ref.current?.querySelector<HTMLElement>("input:not([type=hidden]),select,textarea");
    first?.focus();
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: width }} ref={ref} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          {icon && <div className="modal-icon">{icon}</div>}
          <div className="grow"><h3>{title}</h3>{subtitle && <p className="muted small">{subtitle}</p>}</div>
          <Button variant="ghost" icon={<LuX />} onClick={onClose} aria-label="Fechar" />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children, span }: { label: string; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; span?: 1 | 2 }) {
  // Grupos de botões não podem ficar dentro de <label> (clicar no rótulo acionaria o 1º botão).
  const isGroup = React.isValidElement(children) && (children.type === Segmented);
  const Tag = (isGroup ? "div" : "label") as "label";
  return (
    <Tag className={cls("field", span === 2 && "span2", error && "has-error")} {...(isGroup ? { role: "group", "aria-label": label } : {})}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </Tag>
  );
}

export function MoneyInput({ value, onChange, placeholder = "0,00", autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <div className="money">
      <span>R$</span>
      <input inputMode="decimal" value={value} placeholder={placeholder} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, ""))}
        onBlur={() => { const c = parseBRL(value); if (c != null) onChange(centsToInput(c)); }} />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size }: { value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void; size?: "sm" }) {
  return (
    <div className={cls("seg", size === "sm" && "seg-sm")} role="tablist">
      {options.map((o) => (
        <button type="button" key={o.value} role="tab" aria-selected={o.value === value} className={cls(o.value === value && "on")} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Progress({ value, tone }: { value: number; tone?: "ok" | "warn" | "danger" }) {
  return <div className={cls("progress", tone && `progress-${tone}`)}><div style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

export function Empty({ icon, title, text, action }: { icon?: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return <div className="empty">{icon && <div className="empty-icon">{icon}</div>}<strong>{title}</strong>{text && <p className="muted small">{text}</p>}{action}</div>;
}

export function StatusBadge({ item }: { item: Item }) {
  const { today } = useApp();
  if (item.type === "transfer") return <span className="badge badge-info">Transferência</span>;
  if (item.pre) return <span className="badge badge-ok">Pago antes</span>;
  const st = dueState(item, today);
  const inc = item.type === "income";
  if (st === "paid") return <span className="badge badge-ok">{inc ? "Recebido" : "Pago"}</span>;
  if (item.isCredit) return <span className={cls("badge", st === "overdue" ? "badge-danger" : "badge-muted")}>Na fatura</span>;
  if (st === "overdue") return <span className="badge badge-danger">Atrasado</span>;
  if (st === "soon") return <span className="badge badge-warn">Vence em breve</span>;
  return <span className="badge badge-muted">{inc ? "A receber" : "Pendente"}</span>;
}

export function ProfileTag({ item }: { item: Item }) {
  if (item.type === "transfer") return <span className="ptag">{PROFILE_LABEL[item.profile]} → {PROFILE_LABEL[item.toProfile!]}</span>;
  return <span className={cls("ptag", `ptag-${item.profile}`)}>{PROFILE_LABEL[item.profile]}</span>;
}

export function Amount({ item, cents, kind }: { item?: Item; cents?: number; kind?: "income" | "expense" | "neutral" }) {
  const k = kind || (item ? (item.type === "income" ? "income" : item.type === "transfer" ? "neutral" : "expense") : "neutral");
  const v = cents ?? item!.amountCents;
  return <span className={cls("amount", k === "income" && "pos", k === "expense" && "neg")}>{k === "expense" ? "−" : k === "income" ? "+" : ""}{formatBRL(v)}</span>;
}

/** Ações padrão de um item: pagar/desfazer, editar, detalhes, excluir. */
export function ItemActions({ item, compact }: { item: Item; compact?: boolean }) {
  const { open, update, toast } = useApp();
  const canPay = item.type !== "transfer" && !item.pre;
  const payLabel = item.type === "income" ? "Marcar como recebido" : item.isCredit ? "Pagar fatura" : item.type === "invoice" ? "Pagar fatura" : "Marcar como pago";
  return (
    <div className="actions" onClick={(e) => e.stopPropagation()}>
      {canPay && item.status === "pending" && (
        <Button size="xs" variant="soft" icon={<LuCheck />} title={payLabel} onClick={() => open({ kind: "pay", item })}>{compact ? undefined : item.type === "income" ? "Receber" : "Pagar"}</Button>
      )}
      {canPay && item.status === "paid" && !item.isCredit && (
        <Button size="xs" variant="ghost" icon={<LuUndo2 />} title="Desfazer pagamento" aria-label="Desfazer pagamento" onClick={() => open({ kind: "confirm", title: "Desfazer pagamento?", message: `"${item.description}" voltará a ficar pendente e o saldo será recalculado.`, confirmLabel: "Desfazer", onConfirm: () => { update((d) => opsUnpay(d, item)); toast("Pagamento desfeito", "info"); } })} />
      )}
      <Button size="xs" variant="ghost" icon={<LuEye />} title="Detalhes" aria-label="Detalhes" onClick={() => open({ kind: "details", item })} />
      {item.source !== "invoice" && <Button size="xs" variant="ghost" icon={<LuPencil />} title="Editar" aria-label="Editar" onClick={() => editItem(item, open)} />}
      {item.source !== "invoice" && <Button size="xs" variant="ghost" icon={<LuTrash2 />} title="Excluir" aria-label="Excluir" className="hover-danger" onClick={() => open({ kind: "delete", item })} />}
    </div>
  );
}

import { ops } from "./state";
const opsUnpay = ops.unpay;

export function editItem(item: Item, open: ReturnType<typeof useApp>["open"]) {
  if (item.source === "tx") open({ kind: "tx", txType: item.type as "income", id: item.refId });
  else if (item.source === "rec") open({ kind: "occurrence", recId: item.refId, month: item.occ! });
  else if (item.source === "inst") open({ kind: "installment", id: item.refId });
  else if (item.source === "invoice") open({ kind: "card", id: item.refId });
}

export function Toasts() {
  const { toasts, undo, canUndo } = useApp();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cls("toast", `toast-${t.tone}`)}>
          {t.tone === "err" ? "⚠" : <LuCheck />}<span>{t.text}</span>
          {t.undo && canUndo && <button className="link" onClick={undo}><LuRotateCcw /> Desfazer</button>}
        </div>
      ))}
    </div>
  );
}

export function DateInput({ value, onChange, min }: { value: string; onChange: (v: string) => void; min?: string }) {
  return <input type="date" value={value} min={min} onChange={(e) => onChange(e.target.value)} />;
}

export function useForm<T extends Record<string, unknown>>(init: T) {
  const [v, setV] = useState<T>(init);
  const set = <K extends keyof T>(k: K) => (val: T[K]) => setV((s) => ({ ...s, [k]: val }));
  return [v, set, setV] as const;
}

export function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: (string | { value: string; label: string })[]; placeholder?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="kv"><span className="muted">{k}</span><strong>{v}</strong></div>;
}

export function useUid() { return useId(); }

export function methodLabel(it: Item, cards: Record<string, { name: string }>) {
  if (it.method === CREDIT && it.cardId && cards[it.cardId]) return `Crédito · ${cards[it.cardId].name}`;
  return it.method;
}

export function itemWhen(it: Item) {
  return formatDateBR(it.date);
}

export const today = todayISO;
