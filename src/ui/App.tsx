import React, { useEffect, useRef, useState } from "react";
import { LuSettings, LuPlus, LuChevronLeft, LuChevronRight, LuCloud, LuHardDrive, LuLoader, LuTriangleAlert, LuCloudOff, LuLayoutDashboard, LuListOrdered, LuRepeat, LuLayers, LuCreditCard, LuTarget, LuCalendarDays, LuChartPie, LuSun, LuMoon, LuFlaskConical, LuCheck } from "./icons";
import { AppProvider, useApp } from "./state";
import { Button, Segmented, Toasts, cls } from "./components";
import { ModalHost } from "./forms";
import { Dashboard } from "./dashboard";
import { HistoryPage, RecurringPage, InstallmentsPage, CardsPage, GoalsPage } from "./pages";
import { CalendarPage } from "./calendar";
import { ReportsPage } from "./reports";
import { mergeData } from "../core/storage";
import { addMonths, monthLabel, monthOf, MONTH_NAMES, makeMonth, monthParts } from "../core/dates";

const ROUTES = [
  { id: "dashboard", label: "Dashboard", icon: <LuLayoutDashboard /> },
  { id: "lancamentos", label: "Lançamentos", icon: <LuListOrdered /> },
  { id: "fixas", label: "Contas fixas", icon: <LuRepeat /> },
  { id: "parcelamentos", label: "Parcelamentos", icon: <LuLayers /> },
  { id: "cartoes", label: "Cartões", icon: <LuCreditCard /> },
  { id: "metas", label: "Metas", icon: <LuTarget /> },
  { id: "calendario", label: "Calendário", icon: <LuCalendarDays /> },
  { id: "relatorios", label: "Relatórios", icon: <LuChartPie /> },
] as const;
type Route = (typeof ROUTES)[number]["id"];

function useRoute(): Route {
  const read = () => { const h = location.hash.replace("#", ""); return (ROUTES.some((r) => r.id === h) ? h : "dashboard") as Route; };
  const [r, setR] = useState<Route>(read);
  useEffect(() => { const f = () => { setR(read()); window.scrollTo({ top: 0 }); }; window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  return r;
}

function Logo() {
  return (
    <svg viewBox="0 0 40 40" className="logo" aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="var(--p)" />
      <path d="M12 27 L19 19 L23 23 L29 14" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24.5 14 H29 V18.5" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MonthPicker() {
  const { month, setMonth, today } = useApp();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(monthParts(month).y);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setYear(monthParts(month).y);
    const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, [open]);
  const cur = monthOf(today);
  return (
    <div className="month-picker" ref={ref}>
      <Button variant="ghost" size="sm" icon={<LuChevronLeft />} onClick={() => setMonth(addMonths(month, -1))} aria-label="Mês anterior" />
      <button className="month-label" onClick={() => setOpen(!open)}>{monthLabel(month)}</button>
      <Button variant="ghost" size="sm" icon={<LuChevronRight />} onClick={() => setMonth(addMonths(month, 1))} aria-label="Próximo mês" />
      {month !== cur && <button className="link small today-link" onClick={() => setMonth(cur)}>Hoje</button>}
      {open && (
        <div className="popover">
          <div className="row between align-center"><Button size="xs" variant="ghost" icon={<LuChevronLeft />} onClick={() => setYear(year - 1)} /><strong>{year}</strong><Button size="xs" variant="ghost" icon={<LuChevronRight />} onClick={() => setYear(year + 1)} /></div>
          <div className="months-grid">
            {MONTH_NAMES.map((n, i) => {
              const mk = makeMonth(year, i + 1);
              return <button key={n} className={cls(mk === month && "on", mk === cur && "cur")} onClick={() => { setMonth(mk); setOpen(false); }}>{n.slice(0, 3)}</button>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SaveChip() {
  const { status, demo, open } = useApp();
  let icon: React.ReactNode, text: string, tone = "";
  if (demo) { icon = <LuFlaskConical />; text = "Demonstração · não salva"; tone = "warn"; }
  else if (status.mode === "connecting") { icon = <LuLoader className="spin" />; text = "Conectando…"; }
  else if (status.save === "saving") { icon = <LuLoader className="spin" />; text = "Salvando…"; }
  else if (status.save === "error") { icon = <LuTriangleAlert />; text = "Erro ao salvar"; tone = "danger"; }
  else if (status.save === "offline") { icon = <LuCloudOff />; text = "Sem conexão"; tone = "warn"; }
  else if (status.save === "readonly") { icon = <LuTriangleAlert />; text = "Somente leitura"; tone = "warn"; }
  else if (status.mode === "cloud" || status.mode === "gist") { icon = <LuCloud />; text = "Salvo e sincronizado"; tone = "ok"; }
  else if (status.mode === "local") { icon = <LuHardDrive />; text = "Salvo no navegador"; tone = "ok"; }
  else { icon = <LuTriangleAlert />; text = "Não está salvando"; tone = "danger"; }
  return <button className={cls("save-chip", tone && `t-${tone}`)} title={status.message} onClick={() => open({ kind: "settings", tab: "dados" })}>{icon}<span>{text}</span></button>;
}

function Header() {
  const { view, setView, open, data, update } = useApp();
  const dark = data.settings.theme === "dark";
  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <div><h1>ELEV <span>FINANCE</span></h1><p>Controle financeiro pessoal e empresarial.</p></div>
      </div>
      <div className="topbar-mid">
        <Segmented value={view} onChange={setView} options={[{ value: "pessoal", label: "Pessoal" }, { value: "elev", label: "ELEV" }, { value: "geral", label: "Visão geral" }]} />
        <MonthPicker />
      </div>
      <div className="topbar-right">
        <SaveChip />
        <Button variant="ghost" icon={dark ? <LuSun /> : <LuMoon />} aria-label="Alternar tema" title="Alternar tema claro/escuro" onClick={() => update((d) => ({ ...d, settings: { ...d.settings, theme: dark ? "light" : "dark" } }))} />
        <Button variant="ghost" icon={<LuSettings />} aria-label="Configurações" title="Configurações" onClick={() => open({ kind: "settings" })} />
        <Button variant="primary" icon={<LuPlus />} className="new-btn" onClick={() => open({ kind: "new" })}>NOVO LANÇAMENTO</Button>
      </div>
    </header>
  );
}

function Nav({ route }: { route: Route }) {
  return (
    <nav className="nav" aria-label="Seções">
      {ROUTES.map((r) => <a key={r.id} href={`#${r.id}`} className={cls(route === r.id && "on")}>{r.icon}<span>{r.label}</span></a>)}
    </nav>
  );
}

/** Dados que ficaram só no navegador (versão anterior/sem conexão) → oferece trazer para o banco sincronizado. */
function LocalMigrationBar() {
  const { ready, demo, status, store, data, replaceAll } = useApp();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem("elev-finance:migrated") === "1"; } catch { return false; } });
  if (!ready || demo || hidden || status.mode !== "cloud" || !store?.localHasData) return null;
  const local = store.readLocalBackup();
  if (!local) return null;
  const r = mergeData(data, local);
  if (!r.added) return null;
  const done = () => { try { localStorage.setItem("elev-finance:migrated", "1"); } catch { /* ignora */ } setHidden(true); };
  return (
    <div className="info-bar"><LuHardDrive /> <span className="grow">Encontrei {r.added} registros salvos só neste navegador. Quer levá-los para o armazenamento sincronizado? Nada que já está sincronizado será alterado.</span>
      <button className="link" onClick={() => { replaceAll(r.data, `${r.added} registros enviados para o armazenamento sincronizado`); done(); }}>Trazer</button>
      <button className="link muted" onClick={done}>Agora não</button></div>
  );
}

function Shell() {
  const { ready, demo, setDemo, open, status } = useApp();
  const route = useRoute();
  return (
    <div className="app">
      <Header />
      <Nav route={route} />
      {demo && <div className="demo-bar"><LuFlaskConical /> Modo demonstração: dados de exemplo, isolados e não salvos. <button className="link" onClick={() => setDemo(false)}>Sair</button></div>}
      {status.mode === "local" && !demo && <div className="info-bar"><LuHardDrive /> Salvando apenas neste navegador. Para ter os mesmos dados no computador, notebook e celular, conecte ao GitHub. <button className="link" onClick={() => open({ kind: "settings", tab: "dados" })}>Conectar</button></div>}
      <LocalMigrationBar />
      {status.mode === "memory" && <div className="info-bar danger"><LuTriangleAlert /> Nenhum armazenamento disponível: os dados serão perdidos ao fechar. Exporte um backup.</div>}
      <main className="main" key={route}>
        {!ready ? <div className="loading"><LuLoader className="spin" /> <span>Carregando seus dados com segurança…</span></div> :
          route === "dashboard" ? <Dashboard /> : route === "lancamentos" ? <HistoryPage /> : route === "fixas" ? <RecurringPage /> :
          route === "parcelamentos" ? <InstallmentsPage /> : route === "cartoes" ? <CardsPage /> : route === "metas" ? <GoalsPage /> :
          route === "calendario" ? <CalendarPage /> : <ReportsPage />}
      </main>
      <footer className="foot muted small">ELEV FINANCE · valores em R$ · {status.mode === "cloud" ? "dados no banco privado do Artifact · sincronizado entre dispositivos" : status.mode === "gist" ? "dados no seu Gist do GitHub · sincronizado entre dispositivos" : status.mode === "local" ? "dados neste navegador" : ""}</footer>
      <button className="fab" aria-label="Novo lançamento" onClick={() => open({ kind: "new" })}><LuPlus /></button>
      {ready && <ModalHost />}
      <Toasts />
      {void LuCheck}
    </div>
  );
}

export function App() {
  return <AppProvider><Shell /></AppProvider>;
}
