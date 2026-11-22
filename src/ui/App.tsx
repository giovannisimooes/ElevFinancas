import React, { useEffect, useRef, useState } from "react";
import { LuSettings, LuPlus, LuChevronLeft, LuChevronRight, LuCloud, LuHardDrive, LuLoader, LuTriangleAlert, LuCloudOff, LuLayoutDashboard, LuListOrdered, LuRepeat, LuLayers, LuCreditCard, LuTarget, LuCalendarDays, LuChartPie, LuLayoutGrid, LuTrendingUp, LuTrendingDown, LuSun, LuMoon, LuFlaskConical, LuCheck } from "./icons";
import { AppProvider, useApp } from "./state";
import { Button, Segmented, Toasts, cls } from "./components";
import { ModalHost } from "./forms";
import { Dashboard } from "./dashboard";
import { HistoryPage, RecurringPage, InstallmentsPage, CardsPage, GoalsPage } from "./pages";
import { CalendarPage } from "./calendar";
import { ReportsPage } from "./reports";
import { FlowPage } from "./flows";
import { NavEditor, EditLayoutBar, resolveNav } from "./layout";
import { mergeData } from "../core/storage";
import { addMonths, monthLabel, monthOf, MONTH_NAMES, makeMonth, monthParts } from "../core/dates";

const ROUTES = [
  { id: "dashboard", label: "Dashboard", icon: <LuLayoutDashboard /> },
  { id: "entradas", label: "Entradas", icon: <LuTrendingUp /> },
  { id: "saidas", label: "Saídas", icon: <LuTrendingDown /> },
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
  // Símbolo da ELEV sobre a cor principal (acompanha a cor escolhida em Configurações).
  return (
    <svg viewBox="0 0 40 40" className="logo" aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="var(--p)" />
      <g transform="translate(7 7.6) scale(0.26)" fill="#fff">
        <path d="M75.5 1.4 72.4 0.8 70.4 0.6 70.2 0.5 67.2 0.3 67.1 0.2 64.4 0.2 64.2 0.0 58.5 0.0 58.3 0.2 53.6 0.3 53.5 0.5 52.3 0.5 52.1 0.6 51.1 0.6 50.9 0.8 48.3 1.1 44.4 2.0 39.7 3.5 36.1 5.0 32.3 6.9 27.6 10.0 24.0 12.8 20.2 16.5 17.5 19.6 15.3 22.8 13.3 26.1 11.3 30.4 10.1 33.8 9.2 37.3 8.5 42.1 27.8 42.1 28.5 38.5 29.9 34.7 32.3 30.2 34.6 27.2 38.4 23.4 41.7 20.8 43.7 19.6 48.5 17.4 52.7 16.2 55.1 15.9 55.3 15.7 56.5 15.7 56.6 15.6 62.2 15.4 62.4 15.6 64.5 15.6 64.7 15.7 66.8 15.9 71.0 16.9 75.2 18.7 76.4 19.5 78.4 21.5 79.2 22.8 79.6 24.5 79.5 27.8 78.9 29.8 76.9 33.2 75.5 34.9 72.5 37.8 68.9 40.5 64.5 43.4 58.8 46.7 52.4 49.8 43.5 53.6 42.7 53.8 41.5 54.4 34.3 56.9 33.8 57.3 31.7 57.9 31.3 58.2 23.1 60.9 22.7 60.9 21.1 61.5 20.7 61.5 17.7 62.5 17.2 62.5 16.2 63.0 15.7 63.0 11.3 64.4 11.3 64.8 12.1 66.6 15.4 72.7 17.5 75.7 19.9 78.5 23.6 82.2 28.1 85.8 32.6 88.7 37.8 91.2 42.3 92.9 45.6 93.8 48.6 94.4 50.6 94.6 50.8 94.7 54.2 94.9 54.4 95.0 59.5 95.0 59.7 94.9 61.8 94.9 61.9 94.7 65.3 94.4 69.9 93.4 73.1 92.3 76.0 91.1 80.8 88.7 83.8 86.9 87.6 84.1 90.0 82.0 94.6 77.3 99.8 70.2 99.7 69.8 87.9 62.1 87.6 62.1 85.2 65.7 82.5 68.9 79.2 72.1 75.7 74.5 70.7 77.0 66.9 78.4 64.2 79.0 62.1 79.2 61.9 79.3 57.6 79.5 57.4 79.3 54.1 79.2 51.7 78.7 49.4 78.1 46.2 76.9 41.8 74.5 39.6 72.8 36.6 70.1 36.7 69.8 48.9 65.6 59.2 61.5 66.8 58.0 67.1 58.0 69.3 56.8 69.6 56.8 75.7 53.6 83.7 48.6 89.1 44.6 93.8 40.0 96.8 36.0 97.7 34.3 98.8 31.6 99.4 28.4 99.5 25.4 99.4 25.2 99.2 22.4 98.6 19.8 97.6 17.1 96.2 14.7 94.6 12.4 91.7 9.4 89.7 7.7 87.2 5.9 84.4 4.4 81.3 3.0Z" />
        <circle cx="7.3" cy="84.3" r="7.3" />
      </g>
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
  const { view, setView, open, data, update, editLayout, setEditLayout } = useApp();
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
        <Button variant="ghost" icon={<LuLayoutGrid />} aria-label="Editar layout" title="Editar layout" className={cls(editLayout && "btn-active")} onClick={() => setEditLayout(!editLayout)} />
        <Button variant="ghost" icon={<LuSettings />} aria-label="Configurações" title="Configurações" onClick={() => open({ kind: "settings" })} />
        <Button variant="primary" icon={<LuPlus />} className="new-btn" onClick={() => open({ kind: "new" })}>NOVO LANÇAMENTO</Button>
      </div>
    </header>
  );
}

function Nav({ route }: { route: Route }) {
  const { data, editLayout } = useApp();
  if (editLayout) return <NavEditor routes={ROUTES} />;
  const list = resolveNav(ROUTES, data.settings.layout).filter((r) => !r.hidden || r.id === route);
  return (
    <nav className="nav" aria-label="Seções">
      {list.map((r) => <a key={r.id} href={`#${r.id}`} className={cls(route === r.id && "on")}>{r.icon}<span>{r.label}</span></a>)}
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
      <EditLayoutBar onDashboard={route === "dashboard"} />
      {demo && <div className="demo-bar"><LuFlaskConical /> Modo demonstração: dados de exemplo, isolados e não salvos. <button className="link" onClick={() => setDemo(false)}>Sair</button></div>}
      {status.mode === "local" && !demo && <div className="info-bar"><LuHardDrive /> Salvando apenas neste navegador. Para ter os mesmos dados no computador, notebook e celular, conecte ao GitHub. <button className="link" onClick={() => open({ kind: "settings", tab: "dados" })}>Conectar</button></div>}
      <LocalMigrationBar />
      {status.mode === "memory" && <div className="info-bar danger"><LuTriangleAlert /> Nenhum armazenamento disponível: os dados serão perdidos ao fechar. Exporte um backup.</div>}
      <main className="main" key={route}>
        {!ready ? <div className="loading"><LuLoader className="spin" /> <span>Carregando seus dados com segurança…</span></div> :
          route === "dashboard" ? <Dashboard /> : route === "entradas" ? <FlowPage kind="income" /> : route === "saidas" ? <FlowPage kind="expense" /> : route === "lancamentos" ? <HistoryPage /> : route === "fixas" ? <RecurringPage /> :
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
