import React, { useEffect, useRef, useState } from "react";
import { LuPalette, LuWallet, LuDatabase, LuDownload, LuUpload, LuCheck, LuX, LuCloud, LuHardDrive, LuTriangleAlert, LuRotateCcw, LuFlaskConical, LuCopy, LuSettings, LuPlus } from "react-icons/lu";
import { useApp, ops } from "./state";
import { AccountsTab } from "./accounts";
import { LuLandmark } from "./icons";
import { Modal, Button, Segmented, Field, MoneyInput, Select, cls } from "./components";
import { DEFAULT_CHART_COLORS, emptyData, type Settings, type Profile, type AppData } from "../core/types";
import { makeBackup, validateBackup, mergeData, type BackupCheck, isEmptyData } from "../core/storage";
import { parseBRL, centsToInput, formatBRL } from "../core/money";
import { formatDateBR, isValidISO, todayISO } from "../core/dates";
import { saveFile } from "./download";

const PRESETS = ["#12A150", "#0E8A43", "#16A34A", "#059669", "#0D9488", "#2563EB", "#7C3AED", "#DB2777", "#EA580C", "#111827"];

export function SettingsModal({ tab: initial }: { tab?: string }) {
  const { close } = useApp();
  const [tab, setTab] = useState(initial || "aparencia");
  return (
    <Modal title="Configurações" icon={<LuSettings />} onClose={close} width={760}>
      <div className="settings">
        <nav className="settings-nav">
          {[["aparencia", "Aparência", <LuPalette key="a" />], ["financeiro", "Financeiro", <LuWallet key="b" />], ["contas", "Contas vinculadas", <LuLandmark key="d" />], ["dados", "Dados e backup", <LuDatabase key="c" />]].map(([k, l, i]) => (
            <button key={k as string} className={cls(tab === k && "on")} onClick={() => setTab(k as string)}>{i}{l}</button>
          ))}
        </nav>
        <div className="settings-body">
          {tab === "aparencia" && <Appearance />}
          {tab === "financeiro" && <Financial />}
          {tab === "contas" && <AccountsTab />}
          {tab === "dados" && <DataTab />}
        </div>
      </div>
    </Modal>
  );
}

function useSettings() {
  const { data, update } = useApp();
  const set = (patch: Partial<Settings>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  return [data.settings, set] as const;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <label className="toggle"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span className="toggle-ui" /><span>{label}</span></label>;
}

function Appearance() {
  const [s, set] = useSettings();
  return (
    <div className="stack">
      <section>
        <h4>Tema</h4>
        <Segmented value={s.theme} onChange={(v) => set({ theme: v })} options={[{ value: "light", label: "Claro" }, { value: "dark", label: "Escuro" }]} />
      </section>
      <section>
        <h4>Cor principal</h4>
        <div className="swatches">
          {PRESETS.map((c) => <button key={c} className={cls("swatch", s.primary.toLowerCase() === c.toLowerCase() && "on")} style={{ background: c }} onClick={() => set({ primary: c })} aria-label={c} />)}
          <label className="swatch custom" title="Personalizada"><input type="color" value={s.primary} onChange={(e) => set({ primary: e.target.value })} /><LuPlus /></label>
        </div>
      </section>
      <section>
        <h4>Cores dos gráficos</h4>
        <div className="swatches">
          {s.chartColors.map((c, i) => (
            <label key={i} className="swatch" style={{ background: c }} title={`Série ${i + 1}`}>
              <input type="color" value={c} onChange={(e) => { const arr = [...s.chartColors]; arr[i] = e.target.value; set({ chartColors: arr }); }} />
            </label>
          ))}
          <Button size="sm" variant="ghost" icon={<LuRotateCcw />} onClick={() => set({ chartColors: [...DEFAULT_CHART_COLORS] })}>Restaurar</Button>
        </div>
        <div className="row gap wrap" style={{ marginTop: 6 }}>
          <Button size="sm" onClick={() => set({ chartColors: [s.primary, ...DEFAULT_CHART_COLORS.slice(1)] })}>Usar a cor principal na 1ª série</Button>
        </div>
      </section>
      <section>
        <h4>Aparência dos gráficos</h4>
        <div className="stack-sm">
          <Toggle checked={s.chartStyle.donut} onChange={(v) => set({ chartStyle: { ...s.chartStyle, donut: v } })} label="Categorias em rosca (desligado = pizza)" />
          <Toggle checked={s.chartStyle.rounded} onChange={(v) => set({ chartStyle: { ...s.chartStyle, rounded: v } })} label="Barras com cantos arredondados" />
          <Toggle checked={s.chartStyle.grid} onChange={(v) => set({ chartStyle: { ...s.chartStyle, grid: v } })} label="Linhas de grade" />
          <Toggle checked={s.chartStyle.animate} onChange={(v) => set({ chartStyle: { ...s.chartStyle, animate: v } })} label="Animações e transições" />
        </div>
      </section>
      <section>
        <h4>Preferências visuais</h4>
        <Toggle checked={s.compact} onChange={(v) => set({ compact: v })} label="Modo compacto (mais informação por tela)" />
      </section>
    </div>
  );
}

function ListEditor({ items, onChange, protectedItems = [] }: { items: string[]; onChange: (v: string[]) => void; protectedItems?: string[] }) {
  const [txt, setTxt] = useState("");
  const add = () => { const t = txt.trim(); if (t && !items.includes(t)) onChange([...items, t]); setTxt(""); };
  return (
    <div>
      <div className="chips">
        {items.map((c) => <span key={c} className="chip">{c}{!protectedItems.includes(c) && <button aria-label={`Remover ${c}`} onClick={() => onChange(items.filter((x) => x !== c))}><LuX /></button>}</span>)}
      </div>
      <div className="row gap" style={{ marginTop: 8 }}>
        <input value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="Adicionar…" />
        <Button size="sm" icon={<LuPlus />} onClick={add}>Adicionar</Button>
      </div>
    </div>
  );
}

function InitialBalance({ p }: { p: Profile }) {
  const [s, set] = useSettings();
  const ib = s.initialBalance[p];
  const [v, setV] = useState(centsToInput(ib.amountCents));
  const [d, setD] = useState(ib.date || "");
  const dirty = parseBRL(v) !== ib.amountCents || (d || null) !== ib.date;
  const save = () => {
    const c = parseBRL(v);
    if (c == null) return;
    set({ initialBalance: { ...s.initialBalance, [p]: { amountCents: c, date: d && isValidISO(d) ? d : null } } });
  };
  return (
    <div className="grid3 align-end">
      <Field label={`Saldo inicial — ${p === "elev" ? "ELEV" : "Pessoal"}`}><MoneyInput value={v} onChange={setV} /></Field>
      <Field label="Saldo em (data)" hint="Movimentos anteriores a esta data não alteram o saldo"><input type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field>
      <Button variant={dirty ? "primary" : "default"} disabled={!dirty} onClick={save} icon={<LuCheck />}>Salvar</Button>
    </div>
  );
}

function Financial() {
  const [s, set] = useSettings();
  return (
    <div className="stack">
      <section>
        <h4>Moeda e formato</h4>
        <div className="row gap wrap"><span className="chip">Real brasileiro (BRL) · R$ 1.234,56</span><span className="chip">Datas: dd/mm/aaaa</span></div>
      </section>
      <section>
        <h4>Saldo inicial por perfil</h4>
        <p className="muted small">Informe quanto havia na conta e a partir de quando. O saldo atual = saldo inicial + tudo que foi efetivamente recebido/pago depois dessa data.</p>
        <InitialBalance p="pessoal" />
        <InitialBalance p="elev" />
      </section>
      <section>
        <h4>Perfil exibido ao abrir</h4>
        <Segmented value={s.defaultProfile} onChange={(v) => set({ defaultProfile: v })} options={[{ value: "pessoal", label: "Pessoal" }, { value: "elev", label: "ELEV" }, { value: "geral", label: "Visão geral" }]} />
      </section>
      <section><h4>Categorias de receita</h4><ListEditor items={s.incomeCategories} onChange={(v) => set({ incomeCategories: v })} /></section>
      <section><h4>Categorias de despesa</h4><ListEditor items={s.expenseCategories} onChange={(v) => set({ expenseCategories: v })} /></section>
      <section><h4>Formas de pagamento</h4><ListEditor items={s.methods} onChange={(v) => set({ methods: v })} protectedItems={["Crédito"]} /><p className="muted small">“Crédito” vincula o gasto a um cartão e à fatura.</p></section>
    </div>
  );
}

function DataTab() {
  const { data, status, store, replaceAll, update, demo, setDemo, toast, open } = useApp();
  const [test, setTest] = useState<{ ok: boolean; detail: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [check, setCheck] = useState<BackupCheck | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [beforeImport, setBeforeImport] = useState<AppData | null>(null);

  const runTest = async () => { setTesting(true); setTest(await (store?.selfTest() ?? Promise.resolve({ ok: false, detail: "Armazenamento ainda não iniciado." }))); setTesting(false); };

  const exportJSON = async () => {
    const json = makeBackup(data);
    const name = `elev-finance-backup-${todayISO()}.json`;
    const r = await saveFile(name, json);
    if (r.ok) toast("Backup exportado");
    else if (r.reason === "unavailable") setFallback(json);
    else toast(r.message, "err");
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { setCheck({ ok: false, errors: ["Arquivo grande demais para um backup."] }); return; }
    setCheck(validateBackup(await f.text()));
    if (fileRef.current) fileRef.current.value = "";
  };

  const doImport = (mode: "merge" | "replace") => {
    if (!check?.data) return;
    const run = () => {
      setBeforeImport(data);
      if (mode === "replace") replaceAll(check.data!, "Backup restaurado");
      else { const r = mergeData(data, check.data!); replaceAll(r.data, `${r.added} registros importados, ${r.skipped} já existiam (ignorados)`); }
      setCheck(null);
    };
    if (mode === "replace") open({ kind: "confirm", title: "Substituir todos os dados?", message: "Tudo o que está salvo agora será trocado pelo conteúdo do backup. Recomendo exportar um backup atual antes.", danger: true, confirmLabel: "Substituir", onConfirm: run });
    else run();
  };

  const localData = store?.readLocalBackup();
  const canMigrate = status.mode === "cloud" && !!localData && !isEmptyData(localData);

  return (
    <div className="stack">
      {demo && <div className="note warn"><LuFlaskConical /> <span>Você está no <b>modo demonstração</b>. Nada aqui é salvo. <button className="link" onClick={() => setDemo(false)}>Sair do modo demonstração</button></span></div>}
      <section>
        <h4>Status do armazenamento</h4>
        <div className={cls("storage-box", status.mode)}>
          <div className="storage-icon">{status.mode === "cloud" || status.mode === "gist" ? <LuCloud /> : status.mode === "local" ? <LuHardDrive /> : <LuTriangleAlert />}</div>
          <div className="grow">
            <strong>{status.mode === "cloud" ? "Banco privado do Artifact" : status.mode === "gist" ? "GitHub Gist (link externo)" : status.mode === "local" ? "Armazenamento local do navegador" : status.mode === "connecting" ? "Conectando…" : "Sem armazenamento persistente"}</strong>
            <p className="small muted">{status.message}</p>
            {status.mode === "cloud" && <p className="small">Os dados ficam numa área privada da sua conta (<code>data/users/&lt;seu id&gt;</code>), que nem outras pessoas com acesso ao link conseguem ler. É a mesma área no computador e no app do celular: o que você muda num aparece no outro. Cada alteração é gravada por registro, então mudanças feitas em dois aparelhos não se apagam.</p>}
            {status.mode === "local" && <p className="small">Os dados ficam só neste navegador e dispositivo. Limpar os dados do navegador apaga tudo — exporte backups com frequência.</p>}
            <p className="small muted">Último salvamento: {status.lastSavedAt ? new Date(status.lastSavedAt).toLocaleString("pt-BR") : "—"} · Última sincronização: {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString("pt-BR") : "—"} · Leitura confirmada pelo servidor: {status.verified ? "sim" : "não"}</p>
          </div>
        </div>
        <div className="row gap wrap" style={{ marginTop: 8 }}>
          <Button onClick={runTest} disabled={testing || demo} icon={<LuCheck />}>{testing ? "Testando…" : "Testar salvamento agora"}</Button>
          {(status.mode === "cloud" || status.mode === "gist") && <Button disabled={syncing} icon={<LuRotateCcw />} onClick={async () => { setSyncing(true); const ok = await store!.syncNow(); setSyncing(false); toast(ok ? "Dados atualizados com o servidor" : "Não foi possível falar com o servidor agora", ok ? "ok" : "err"); }}>{syncing ? "Sincronizando…" : "Sincronizar agora"}</Button>}
          {test && <span className={cls("badge", test.ok ? "badge-ok" : "badge-danger")}>{test.ok ? "Funcionando" : "Falhou"}</span>}
        </div>
        {test && <p className="small muted">{test.detail}</p>}
        {canMigrate && <div className="note" style={{ marginTop: 8 }}><LuHardDrive /> <span>Há dados salvos localmente neste navegador de um acesso anterior. <button className="link" onClick={() => { const r = mergeData(data, localData!); replaceAll(r.data, `${r.added} registros trazidos do navegador`); }}>Trazer para o banco privado</button></span></div>}
      </section>

      <GithubSync />

      <section>
        <h4>Backup</h4>
        <div className="row gap wrap">
          <Button icon={<LuDownload />} onClick={exportJSON}>Exportar backup (JSON)</Button>
          <Button icon={<LuUpload />} onClick={() => fileRef.current?.click()}>Importar backup</Button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        {fallback && <div className="fallback">
          <p className="small">O download direto não está disponível nesta visualização. Copie o conteúdo abaixo e salve em um arquivo <code>.json</code>:</p>
          <textarea readOnly rows={5} value={fallback} />
          <div className="row gap"><Button size="sm" icon={<LuCopy />} onClick={() => navigator.clipboard.writeText(fallback).then(() => toast("Copiado"), () => toast("Não foi possível copiar", "err"))}>Copiar</Button><Button size="sm" variant="ghost" onClick={() => setFallback(null)}>Fechar</Button></div>
        </div>}
        {check && (check.ok ? (
          <div className="import-box">
            <strong><LuCheck /> Backup válido</strong>{check.exportedAt && <span className="muted small"> · gerado em {new Date(check.exportedAt).toLocaleString("pt-BR")}</span>}
            <div className="chips" style={{ margin: "8px 0" }}>{Object.entries(check.counts!).map(([k, v]) => <span key={k} className="chip">{k}: {v}</span>)}</div>
            <div className="row gap wrap">
              <Button variant="primary" onClick={() => doImport("merge")}>Mesclar (sem duplicar)</Button>
              <Button variant="danger" onClick={() => doImport("replace")}>Substituir tudo</Button>
              <Button variant="ghost" onClick={() => setCheck(null)}>Cancelar</Button>
            </div>
            <p className="small muted">Mesclar adiciona só registros que ainda não existem (mesmo ID = ignorado).</p>
          </div>
        ) : (
          <div className="import-box err"><strong><LuTriangleAlert /> Backup recusado</strong><ul className="small">{check.errors.map((e) => <li key={e}>{e}</li>)}</ul><Button size="sm" variant="ghost" onClick={() => setCheck(null)}>Fechar</Button></div>
        ))}
        {beforeImport && <div className="note" style={{ marginTop: 8 }}><LuRotateCcw /> <span>Importação feita. <button className="link" onClick={() => { replaceAll(beforeImport, "Dados anteriores à importação restaurados"); setBeforeImport(null); }}>Voltar ao estado anterior à importação</button></span></div>}
      </section>

      <section>
        <h4>Lixeira ({data.trash.length})</h4>
        {!data.trash.length ? <p className="muted small">Nada excluído recentemente.</p> : (
          <ul className="mini-list">
            {data.trash.slice(0, 50).map((t) => (
              <li key={t.id + t.deletedAt}>
                <span className="grow ellipsis">{t.label}</span>
                <span className="muted small">{({ txs: "Lançamento", recurring: "Recorrente", installments: "Parcelamento", cards: "Cartão", goals: "Meta" } as Record<string, string>)[t.kind] || t.kind} · {new Date(t.deletedAt).toLocaleDateString("pt-BR")}</span>
                <Button size="xs" variant="soft" icon={<LuRotateCcw />} onClick={() => update((d) => ops.restore(d, t.id, t.deletedAt), "Registro restaurado")}>Restaurar</Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4>Modo demonstração</h4>
        <p className="muted small">Carrega exemplos isolados para testar o app. Eles ficam só na memória, não se misturam aos seus dados e somem ao sair.</p>
        <Button icon={<LuFlaskConical />} onClick={() => setDemo(!demo)}>{demo ? "Sair do modo demonstração" : "Abrir modo demonstração"}</Button>
      </section>

      <section>
        <h4 className="neg">Zona de perigo</h4>
        <DangerReset disabled={demo} onReset={() => replaceAll({ ...emptyData(), settings: data.settings, trash: [] }, "Todos os lançamentos foram apagados")} />
      </section>
    </div>
  );
}

/** Sincronização da versão aberta fora do Claude (GitHub Pages) por um Gist secreto. */
function GithubSync() {
  const { status, store, data, toast, open, demo } = useApp();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (status.mode === "cloud") return (
    <section>
      <h4>Acesso por link externo</h4>
      <p className="muted small">Aqui dentro do Claude os dados já sincronizam pelo banco do Artifact. Para usar pelo link externo (GitHub Pages), abra o app por lá e conecte ao GitHub nesta mesma tela. Para levar os dados daqui para lá, use “Exportar backup” abaixo e “Importar backup” na versão externa.</p>
    </section>
  );
  const info = store?.gistInfo;
  const connect = async () => {
    if (!token.trim()) { setErr("Cole o token do GitHub."); return; }
    setBusy(true); setErr("");
    try {
      const r = await store!.connectGist(token, data);
      setToken("");
      toast(r.created ? "Conectado! Dados guardados num Gist secreto novo" : r.added ? `Conectado! ${r.added} registros deste aparelho foram juntados aos do GitHub` : "Conectado! Dados carregados do GitHub");
    } catch (e: any) { setErr(e?.message || String(e)); }
    setBusy(false);
  };
  return (
    <section>
      <h4>Sincronizar pelo GitHub (link externo)</h4>
      {status.mode === "gist" && info ? <>
        <p className="small">Conectado{info.login ? <> à conta <b>{info.login}</b></> : null}. Os dados ficam num Gist secreto (<code>{info.gistId.slice(0, 8)}…</code>) e aparecem em todos os aparelhos conectados com um token da mesma conta.</p>
        <div className="row gap wrap">
          <a className="btn btn-ghost btn-sm" href={`https://gist.github.com/${info.gistId}`} target="_blank" rel="noreferrer">Ver o Gist no GitHub</a>
          <Button size="sm" variant="ghost" onClick={() => open({ kind: "confirm", title: "Desconectar este aparelho?", message: "Os dados continuam salvos no GitHub e nos outros aparelhos. Neste navegador, o app passa a salvar só localmente até você conectar de novo.", confirmLabel: "Desconectar", onConfirm: () => { store!.disconnectGist(data); toast("Aparelho desconectado do GitHub", "info"); } })}>Desconectar este aparelho</Button>
        </div>
      </> : <>
        <p className="muted small">Para usar o mesmo link no computador, notebook e celular com os mesmos dados: crie um token no GitHub com permissão <b>gist</b> e cole aqui, uma vez em cada aparelho. Na primeira conexão o app cria um Gist secreto com seus dados; nos outros aparelhos ele encontra o mesmo Gist sozinho.</p>
        <div className="row gap wrap align-center">
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Token do GitHub (ghp_… ou github_pat_…)" style={{ maxWidth: 340 }} autoComplete="off" />
          <Button variant="primary" disabled={busy || demo} onClick={connect} icon={<LuCloud />}>{busy ? "Conectando…" : "Conectar"}</Button>
        </div>
        {err && <p className="small neg">{err}</p>}
        <p className="muted small">Criar o token: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token → marque só <b>gist</b>. O token fica salvo apenas neste navegador.</p>
      </>}
    </section>
  );
}

function DangerReset({ onReset, disabled }: { onReset: () => void; disabled?: boolean }) {
  const [txt, setTxt] = useState("");
  return (
    <div className="row gap wrap align-center">
      <input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder='Digite APAGAR para confirmar' style={{ maxWidth: 240 }} />
      <Button variant="danger" disabled={txt !== "APAGAR" || disabled} onClick={() => { onReset(); setTxt(""); }}>Apagar todos os lançamentos</Button>
      <span className="muted small">Mantém as configurações. Use “Desfazer” logo em seguida se foi engano.</span>
    </div>
  );
}

export { formatBRL, formatDateBR, Select, useEffect };
