// Armazenamento: banco privado do Artifact (data/users/<id>/, privado até do dono do artifact),
// sincronizado entre dispositivos da mesma conta, com alternativa local (localStorage) quando o banco
// não estiver disponível.
//
// Sincronização: cada alteração é gravada POR REGISTRO (update de um campo dentro do documento do mês
// ou da seção), nunca regravando o documento inteiro. Assim, uma despesa criada no celular não é
// apagada quando o computador marca outro lançamento do mesmo mês como pago.
// Formato no banco: items.<id> = [registro]   (lista de 1 elemento → substituição integral do registro)
//                   items.<id> = null         (registro excluído)
// Documentos gravados por versões anteriores (items.<id> = registro) continuam sendo lidos normalmente.

import type { AppData, Settings } from "./types";
import { emptyData, defaultSettings } from "./types";
import { type GistCfg, readGistCfg, writeGistCfg, readGistCache, writeGistCache, gistRead, gistWrite, gistConnect, GistError } from "./gist";

export type StorageMode = "connecting" | "cloud" | "gist" | "local" | "memory";
export type SaveState = "idle" | "saving" | "saved" | "error" | "offline" | "readonly";

export interface StorageStatus {
  mode: StorageMode;
  save: SaveState;
  lastSavedAt: string | null;
  lastSyncAt: string | null;
  message: string;
  verified: boolean; // primeira leitura confirmada pelo servidor
}

type Docs = Record<string, Record<string, unknown>>;

const LOCAL_KEY = "elev-finance:v1:docs";
export const SCHEMA = 1;

export type Section = "txs" | "recurring" | "installments" | "cards" | "goals";
export const SECTIONS: Section[] = ["txs", "recurring", "installments", "cards", "goals"];

/** Uma alteração de registro feita pelo usuário (antes → depois). */
export type Change =
  | { sec: Section; id: string; before: any; after: any }
  | { sec: "settings" | "trash"; id?: undefined; before: any; after: any };

const json = (v: unknown) => JSON.stringify(v ?? null);

/** Diferença registro a registro entre dois estados do app. */
export function diffData(a: AppData, b: AppData): Change[] {
  const out: Change[] = [];
  for (const sec of SECTIONS) {
    const A = a[sec] as Record<string, unknown>, B = b[sec] as Record<string, unknown>;
    if (A === B) continue;
    const ids = new Set([...Object.keys(A), ...Object.keys(B)]);
    for (const id of ids) {
      const x = A[id], y = B[id];
      if (x === y || json(x) === json(y)) continue;
      out.push({ sec, id, before: x ?? null, after: y ?? null });
    }
  }
  if (a.settings !== b.settings && json(a.settings) !== json(b.settings)) out.push({ sec: "settings", before: a.settings, after: b.settings });
  if (a.trash !== b.trash && json(a.trash) !== json(b.trash)) out.push({ sec: "trash", before: a.trash, after: b.trash });
  return out;
}

/** Aplica alterações (ou o inverso delas) sobre o estado atual, sem tocar no resto. */
export function applyChanges(d: AppData, changes: Change[], inverse = false): AppData {
  const out: AppData = { ...d };
  for (const c of changes) {
    const v = inverse ? c.before : c.after;
    if (c.sec === "settings") { out.settings = v; continue; }
    if (c.sec === "trash") { out.trash = v || []; continue; }
    const sec = { ...(out[c.sec] as Record<string, unknown>) };
    if (v == null) delete sec[c.id!]; else sec[c.id!] = v;
    (out as any)[c.sec] = sec;
  }
  return out;
}

function docIdFor(sec: Section, rec: any): string {
  return sec === "txs" ? "tx-" + String(rec.date).slice(0, 7) : sec;
}

export function dataToDocs(d: AppData): Docs {
  const docs: Docs = {
    meta: { schema: SCHEMA, app: "elev-finance" },
    settings: { value: d.settings as unknown as Record<string, unknown> },
    cards: { items: d.cards },
    goals: { items: d.goals },
    recurring: { items: d.recurring },
    installments: { items: d.installments },
    trash: { items: d.trash.slice(0, 300) },
  };
  for (const t of Object.values(d.txs)) {
    const k = "tx-" + t.date.slice(0, 7);
    (docs[k] ||= { items: {} });
    (docs[k].items as Record<string, unknown>)[t.id] = t;
  }
  return docs;
}

/** Lê os itens de um documento nos dois formatos (antigo e por registro) e ignora excluídos. */
function readItems(v: unknown): Record<string, any> {
  const out: Record<string, any> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [id, raw] of Object.entries(v as Record<string, unknown>)) {
    const rec = Array.isArray(raw) ? raw[0] : raw;
    if (rec && typeof rec === "object") out[id] = rec;
  }
  return out;
}

export function docsToData(docs: Docs): AppData {
  const d = emptyData();
  const s = (docs.settings?.value || {}) as Partial<Settings>;
  d.settings = mergeSettings(s);
  d.cards = readItems(docs.cards?.items);
  d.goals = readItems(docs.goals?.items);
  d.recurring = readItems(docs.recurring?.items);
  d.installments = readItems(docs.installments?.items);
  d.trash = (Array.isArray(docs.trash?.items) ? docs.trash.items : []) as AppData["trash"];
  const months = Object.keys(docs).filter((k) => k.startsWith("tx-")).sort();
  for (const k of months) Object.assign(d.txs, readItems(docs[k].items));
  // Um lançamento que mudou de mês pode existir em dois documentos durante a sincronização:
  // vale o que corresponde à data atual do próprio registro.
  for (const k of months) {
    for (const [id, rec] of Object.entries(readItems(docs[k].items))) {
      if ("tx-" + String(rec.date).slice(0, 7) === k) d.txs[id] = rec;
    }
  }
  return d;
}

export function mergeSettings(s: Partial<Settings>): Settings {
  const def = defaultSettings();
  return {
    ...def, ...s,
    chartStyle: { ...def.chartStyle, ...(s.chartStyle || {}) },
    initialBalance: { pessoal: { ...def.initialBalance.pessoal, ...(s.initialBalance?.pessoal || {}) }, elev: { ...def.initialBalance.elev, ...(s.initialBalance?.elev || {}) } },
    chartColors: Array.isArray(s.chartColors) && s.chartColors.length ? s.chartColors : def.chartColors,
    incomeCategories: Array.isArray(s.incomeCategories) ? s.incomeCategories : def.incomeCategories,
    expenseCategories: Array.isArray(s.expenseCategories) ? s.expenseCategories : def.expenseCategories,
    methods: Array.isArray(s.methods) ? s.methods : def.methods,
  };
}

export function isEmptyData(d: AppData): boolean {
  return !Object.keys(d.txs).length && !Object.keys(d.recurring).length && !Object.keys(d.installments).length && !Object.keys(d.cards).length && !Object.keys(d.goals).length;
}

function readLocal(): Docs | null {
  try { const raw = localStorage.getItem(LOCAL_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeLocal(docs: Docs): boolean {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(docs)); return true; } catch { return false; }
}

async function getClaude(timeoutMs = 4000): Promise<any | null> {
  // Fora do Claude (página aberta direto, ex.: GitHub Pages) não há runtime do Artifact: não espera.
  let framed = true;
  try { framed = window.self !== window.top; } catch { framed = true; }
  if (!framed && !(window as any).claude) timeoutMs = 300;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const c = (window as any).claude;
    if (c && typeof c.use === "function") return c;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Alterações ainda não confirmadas pelo servidor, por documento. */
type Patch = { items: Map<string, any>; whole?: Record<string, unknown> };

export class Store {
  status: StorageStatus = { mode: "connecting", save: "idle", lastSavedAt: null, lastSyncAt: null, message: "Conectando ao armazenamento…", verified: false };
  private col: any = null;
  private server = new Map<string, Record<string, unknown>>(); // último conteúdo conhecido do servidor
  private queue = new Map<string, Patch>();   // a enviar
  private inflight = new Map<string, Patch>(); // enviando agora
  private unsub: (() => void) | null = null;
  private onStatus: (s: StorageStatus) => void;
  private onRemote: (d: AppData) => void;
  private lastEmitted = "";
  localHasData = false;

  constructor(onStatus: (s: StorageStatus) => void, onRemote: (d: AppData) => void) {
    this.onStatus = onStatus; this.onRemote = onRemote;
  }

  private set(p: Partial<StorageStatus>) { this.status = { ...this.status, ...p }; this.onStatus(this.status); }

  /** Resolve o mecanismo e devolve os dados iniciais. */
  async init(): Promise<AppData> {
    const local = readLocal();
    this.localHasData = !!local && !isEmptyData(docsToData(local));
    try {
      const claude = await getClaude();
      if (claude) {
        const [db, user] = await Promise.all([withTimeout<any>(claude.use("db"), 11000), withTimeout<any>(claude.use("user"), 11000)]);
        const uid = user ? await withTimeout<string | null>(user.id(), 5000) : null;
        if (db && uid) {
          this.col = db.collection("data/users/" + uid);
          const docs = await this.firstLoad();
          if (docs) {
            for (const [k, v] of Object.entries(docs)) this.server.set(k, v);
            this.set({ mode: "cloud", message: "Banco privado do Artifact — sincronizado entre seus dispositivos", lastSyncAt: new Date().toISOString() });
            this.subscribe();
            this.watchFocus();
            const d = this.merged();
            this.lastEmitted = JSON.stringify(d);
            return d;
          }
        }
      }
    } catch (e) {
      console.warn("db indisponível", e);
    }
    // Fora do Claude: Gist do GitHub, se este aparelho já foi conectado
    const gcfg = readGistCfg();
    if (gcfg) return this.initGist(gcfg);
    // Alternativa: navegador
    if (writeLocalProbe()) {
      this.set({ mode: "local", verified: true, save: "saved", message: "Armazenamento local deste navegador (o banco privado não está disponível nesta visualização) — não sincroniza com outros dispositivos" });
      return local ? docsToData(local) : emptyData();
    }
    this.set({ mode: "memory", verified: false, save: "error", message: "Sem armazenamento disponível: os dados só ficam nesta aba. Exporte um backup!" });
    return emptyData();
  }

  private firstLoad(): Promise<Docs | null> {
    return new Promise((resolve) => {
      let done = false;
      let cached: Docs | null = null;
      const timer = setTimeout(() => {
        if (done) return;
        done = true; unsub();
        if (cached) { this.set({ verified: false, message: "Dados do último acesso; servidor ainda não confirmou" }); resolve(cached); }
        else resolve(null);
      }, 10000);
      const unsub = this.col.onSnapshot((snap: any) => {
        const docs: Docs = {};
        for (const d of snap.docs) if (d.exists) docs[d.id] = d.data();
        if (snap.metadata?.fromCache) { cached = docs; return; }
        if (done) return;
        done = true; clearTimeout(timer); unsub();
        this.set({ verified: true, save: "saved" });
        resolve(docs);
      }, (err: any) => {
        if (done) return;
        done = true; clearTimeout(timer);
        console.warn("erro ao ler", err);
        resolve(null);
      });
    });
  }

  /** Servidor + alterações locais ainda não confirmadas. */
  private merged(): AppData {
    const docs: Docs = {};
    for (const [k, v] of this.server) docs[k] = v;
    for (const layer of [this.inflight, this.queue]) {
      for (const [k, p] of layer) {
        if (p.whole) { docs[k] = p.whole; continue; }
        const base = (docs[k]?.items && typeof docs[k].items === "object" ? docs[k].items : {}) as Record<string, unknown>;
        const items = { ...base };
        for (const [id, v] of p.items) items[id] = v;
        docs[k] = { ...(docs[k] || {}), items };
      }
    }
    return docsToData(docs);
  }

  /** Recebe um retrato do servidor (tempo real, ou leitura ao voltar ao app). */
  private applyServer(snapDocs: { id: string; exists: boolean; data(): any }[], full: boolean) {
    const seen = new Set<string>();
    for (const d of snapDocs) {
      if (!d.exists) continue;
      seen.add(d.id);
      this.server.set(d.id, d.data());
    }
    if (full) for (const k of [...this.server.keys()]) if (!seen.has(k)) this.server.delete(k);
    this.set({ lastSyncAt: new Date().toISOString() });
    const d = this.merged();
    const j = JSON.stringify(d);
    if (j !== this.lastEmitted) { this.lastEmitted = j; this.onRemote(d); }
  }

  private subscribe() {
    let warn: any = setTimeout(() => this.set({ save: "offline" }), 12000);
    this.unsub = this.col.onSnapshot((snap: any) => {
      if (snap.metadata?.fromCache) return;
      if (warn) { clearTimeout(warn); warn = null; if (this.status.save === "offline") this.set({ save: "saved" }); }
      this.applyServer(snap.docs, true);
    }, (err: any) => {
      console.warn("assinatura encerrada", err);
      this.set({ save: err?.code === "revoked" ? "readonly" : "offline", message: "Conexão em tempo real interrompida. As alterações continuam sendo salvas; recarregue para voltar a receber as de outros dispositivos." });
    });
  }

  /** Ao voltar para o app (ex.: celular desbloqueado), busca o estado mais recente. */
  private focusWatched = false;
  private watchFocus() {
    if (this.focusWatched) return;
    this.focusWatched = true;
    let last = 0;
    const f = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 4000) return;
      last = Date.now();
      this.syncNow().catch(() => {});
    };
    document.addEventListener("visibilitychange", f);
    window.addEventListener("focus", f);
  }

  // ------------------------------------------------------------------ Gist (link externo)
  private gist: GistCfg | null = null;
  private gistData: AppData | null = null;   // último estado confirmado do Gist
  private gistPending: Change[] = [];
  private gistBusy = false;
  private gistTimer: any = null;
  private gistPoll: any = null;

  get gistInfo() { return this.gist ? { login: this.gist.login || "", gistId: this.gist.gistId } : null; }

  private parseGist(content: string): AppData {
    if (!content.trim()) return emptyData();
    const chk = validateBackup(content);
    if (!chk.ok || !chk.data) throw new GistError("O arquivo de dados no Gist está inválido: " + chk.errors.join(" "), 422);
    return chk.data;
  }

  private emit(d: AppData) {
    const j = JSON.stringify(d);
    if (j !== this.lastEmitted) { this.lastEmitted = j; this.onRemote(d); }
  }

  private async initGist(cfg: GistCfg): Promise<AppData> {
    this.gist = cfg;
    try {
      const { content } = await gistRead(cfg);
      const d = this.parseGist(content);
      this.gistData = d;
      writeGistCache(content);
      this.set({ mode: "gist", verified: true, save: "saved", lastSyncAt: new Date().toISOString(), message: `GitHub Gist (conta ${cfg.login || "conectada"}) — sincronizado entre os aparelhos conectados` });
    } catch (e: any) {
      const cache = readGistCache();
      if (!cache) {
        this.gist = null;
        this.set({ mode: "local", verified: true, save: "error", message: "Não foi possível abrir os dados do GitHub: " + (e?.message || e) + " Reconecte em Configurações → Dados." });
        const local = readLocal();
        return local ? docsToData(local) : emptyData();
      }
      this.gistData = this.parseGist(cache);
      this.set({ mode: "gist", verified: false, save: "offline", message: "Sem conexão com o GitHub — mostrando a última cópia deste aparelho. " + (e?.message || "") });
    }
    this.startGistPolling();
    this.lastEmitted = JSON.stringify(this.gistData);
    return this.gistData!;
  }

  private startGistPolling() {
    this.watchFocus();
    clearInterval(this.gistPoll);
    this.gistPoll = setInterval(() => { if (document.visibilityState === "visible") this.syncNow().catch(() => {}); }, 45000);
  }

  /** Conecta este aparelho ao Gist da conta (encontra o existente ou cria um). Mescla sem duplicar. */
  async connectGist(token: string, current: AppData): Promise<{ data: AppData; created: boolean; added: number }> {
    const { cfg, created } = await gistConnect(token, () => makeBackup(current));
    const { content } = await gistRead(cfg);
    const remote = this.parseGist(content);
    const m = created ? { data: remote, added: 0 } : mergeData(remote, current);
    if (!created && m.added) await gistWrite(cfg, makeBackup(m.data));
    writeGistCfg(cfg);
    writeGistCache(makeBackup(m.data));
    this.gist = cfg; this.gistData = m.data; this.gistPending = [];
    this.set({ mode: "gist", verified: true, save: "saved", lastSavedAt: new Date().toISOString(), lastSyncAt: new Date().toISOString(), message: `GitHub Gist (conta ${cfg.login || "conectada"}) — sincronizado entre os aparelhos conectados` });
    this.startGistPolling();
    this.lastEmitted = JSON.stringify(m.data);
    this.onRemote(m.data);
    return { data: m.data, created, added: m.added };
  }

  disconnectGist(current: AppData) {
    writeGistCfg(null);
    clearInterval(this.gistPoll);
    this.gist = null; this.gistPending = [];
    writeLocal(dataToDocs(current));
    this.set({ mode: "local", save: "saved", message: "Desconectado do GitHub. Os dados ficam só neste navegador." });
  }

  private scheduleGistFlush() {
    clearTimeout(this.gistTimer);
    this.gistTimer = setTimeout(() => this.flushGist(), 700);
  }

  /** Lê a versão mais recente, aplica só as alterações deste aparelho e grava de volta. */
  private async flushGist() {
    if (this.gistBusy || !this.gist) return;
    this.gistBusy = true;
    try {
      while (this.gistPending.length) {
        this.set({ save: "saving" });
        const changes = this.gistPending.splice(0);
        try {
          const { content } = await gistRead(this.gist);
          const remote = this.parseGist(content);
          const next = applyChanges(remote, changes);
          const out = makeBackup(next);
          await gistWrite(this.gist, out);
          this.gistData = next;
          writeGistCache(out);
          this.set({ save: "saved", verified: true, lastSavedAt: new Date().toISOString(), lastSyncAt: new Date().toISOString() });
          this.emit(applyChanges(next, this.gistPending));
        } catch (e: any) {
          this.gistPending.unshift(...changes);
          throw e;
        }
      }
    } catch (e: any) {
      console.warn("falha ao salvar no GitHub", e);
      const auth = e?.status === 401 || e?.status === 403 || e?.status === 404;
      this.set({ save: auth ? "error" : "offline", message: (e?.message || "Falha ao salvar no GitHub.") + (auth ? " Reconecte em Configurações → Dados." : " Nova tentativa em 10 s — não feche o app.") });
      if (!auth) setTimeout(() => this.flushGist(), 10000);
    } finally { this.gistBusy = false; }
  }

  /** Leitura completa do servidor, sob demanda. */
  async syncNow(): Promise<boolean> {
    if (this.status.mode === "gist" && this.gist) {
      if (this.gistBusy) return true;
      try {
        const { content } = await gistRead(this.gist);
        const remote = this.parseGist(content);
        this.gistData = remote;
        writeGistCache(content);
        this.set({ lastSyncAt: new Date().toISOString(), verified: true, ...(this.status.save === "offline" ? { save: "saved" as SaveState } : {}) });
        this.emit(applyChanges(remote, this.gistPending));
        if (this.gistPending.length) this.flushGist();
        return true;
      } catch (e: any) {
        this.set({ save: "offline", message: (e?.message || "Sem conexão com o GitHub.") });
        return false;
      }
    }
    if (this.status.mode !== "cloud" || !this.col) return false;
    const snap = await withTimeout<any>(this.col.get(), 12000);
    if (!snap) return false;
    this.applyServer(snap.docs, true);
    return true;
  }

  /** Grava só o que mudou. `full` é usado no modo local (arquivo inteiro no navegador). */
  save(changes: Change[], full: AppData) {
    if (this.status.mode === "gist") {
      if (!changes.length) return;
      this.gistPending.push(...changes);
      writeGistCache(makeBackup(full));
      this.set({ save: "saving" });
      this.scheduleGistFlush();
      return;
    }
    if (this.status.mode === "local") {
      const ok = writeLocal(dataToDocs(full));
      this.set({ save: ok ? "saved" : "error", lastSavedAt: new Date().toISOString(), message: ok ? this.status.message : "Falha ao gravar no navegador (espaço cheio?)" });
      return;
    }
    if (this.status.mode !== "cloud" || !changes.length) return;
    for (const c of changes) {
      if (c.sec === "settings") { this.queueWhole("settings", { value: c.after }); continue; }
      if (c.sec === "trash") { this.queueWhole("trash", { items: (c.after || []).slice(0, 300) }); continue; }
      const oldDoc = c.before ? docIdFor(c.sec, c.before) : null;
      const newDoc = c.after ? docIdFor(c.sec, c.after) : null;
      if (oldDoc && oldDoc !== newDoc) this.queueItem(oldDoc, c.id!, null);
      if (newDoc) this.queueItem(newDoc, c.id!, [c.after]);
      else if (oldDoc) this.queueItem(oldDoc, c.id!, null);
    }
    if (!this.server.has("meta") && !this.queue.has("meta")) this.queueWhole("meta", { schema: SCHEMA, app: "elev-finance" });
    this.flush();
  }

  private queueItem(doc: string, id: string, v: any) {
    const p = this.queue.get(doc) || { items: new Map() };
    p.items.set(id, v);
    this.queue.set(doc, p);
  }
  private queueWhole(doc: string, v: Record<string, unknown>) { this.queue.set(doc, { items: new Map(), whole: v }); }

  private flushing = false;
  private async flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.queue.size) {
        this.set({ save: "saving" });
        const batch = [...this.queue.entries()];
        this.queue.clear();
        for (const [k, p] of batch) this.inflight.set(k, p);
        const results = await Promise.allSettled(batch.map(([k, p]) => this.writeDoc(k, p)));
        let firstErr: any = null;
        results.forEach((r, i) => {
          const [k, p] = batch[i];
          this.inflight.delete(k);
          if (r.status === "fulfilled") return;
          firstErr ||= r.reason;
          // devolve à fila sem perder alterações mais novas do mesmo documento
          const newer = this.queue.get(k);
          if (p.whole) { if (!newer) this.queue.set(k, p); }
          else if (!newer?.whole) {
            const merged: Patch = { items: new Map(p.items) };
            if (newer) for (const [id, v] of newer.items) merged.items.set(id, v);
            this.queue.set(k, merged);
          }
        });
        if (firstErr) throw firstErr;
      }
      this.set({ save: "saved", lastSavedAt: new Date().toISOString() });
    } catch (e: any) {
      console.warn("falha ao salvar", e);
      const code = e?.code;
      if (code === "invalid_argument") this.set({ save: "readonly", message: "Sem permissão de gravação nesta visualização." });
      else if (code === "quota_exceeded") this.set({ save: "error", message: "Limite do banco atingido. Exporte um backup." });
      else {
        this.set({ save: "error", message: "Não foi possível salvar (sem conexão?). Nova tentativa em 5 s — não feche o app." });
        setTimeout(() => this.flush(), 5000);
      }
    } finally { this.flushing = false; }
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try { return await fn(); }
    catch (e: any) {
      if (e?.code === "unavailable" || !e?.code) { await sleep(400 + Math.random() * 800); return fn(); }
      throw e;
    }
  }

  private async writeDoc(k: string, p: Patch) {
    const ref = this.col.doc(k);
    if (p.whole) {
      await this.withRetry(() => ref.set(p.whole));
      this.server.set(k, p.whole);
      return;
    }
    const items: Record<string, unknown> = {};
    for (const [id, v] of p.items) items[id] = v;
    const exists = this.server.has(k) || (await this.withRetry<any>(() => ref.get())).exists;
    if (exists) {
      try { await this.withRetry(() => ref.update({ items })); }
      catch (e: any) {
        if (e?.code !== "invalid_argument") throw e;
        // documento removido em outro lugar: recria só com estes registros
        await this.withRetry(() => ref.set({ items }));
      }
    } else {
      await this.withRetry(() => ref.set({ items }));
    }
    const cur = (this.server.get(k)?.items || {}) as Record<string, unknown>;
    this.server.set(k, { ...(this.server.get(k) || {}), items: { ...cur, ...items } });
  }

  hasUnsaved() { return this.queue.size > 0 || this.inflight.size > 0 || this.gistPending.length > 0 || this.gistBusy; }

  /** Teste real: grava, lê de volta e apaga um documento de teste. */
  async selfTest(): Promise<{ ok: boolean; detail: string }> {
    const token = Math.random().toString(36).slice(2);
    if (this.status.mode === "cloud") {
      try {
        const ref = this.col.doc("selftest");
        await ref.set({ token, at: new Date().toISOString() });
        const snap = await ref.get();
        const ok = snap.exists && snap.data()?.token === token;
        await ref.delete();
        return { ok, detail: ok ? "Gravação, leitura e exclusão no banco privado confirmadas pelo servidor." : "A leitura não devolveu o valor gravado." };
      } catch (e: any) { return { ok: false, detail: "Erro: " + (e?.code || e?.message || e) }; }
    }
    if (this.status.mode === "gist" && this.gist) {
      try {
        const { content } = await gistRead(this.gist);
        this.parseGist(content);
        return { ok: true, detail: "Leitura do Gist no GitHub confirmada. As alterações são gravadas lá e aparecem nos outros aparelhos conectados com o mesmo token." };
      } catch (e: any) { return { ok: false, detail: "Erro: " + (e?.message || e) }; }
    }
    if (this.status.mode === "local") {
      try {
        localStorage.setItem("elev-finance:selftest", token);
        const ok = localStorage.getItem("elev-finance:selftest") === token;
        localStorage.removeItem("elev-finance:selftest");
        return { ok, detail: ok ? "Gravação e leitura no navegador confirmadas. Os dados ficam só neste navegador/dispositivo." : "Leitura falhou." };
      } catch (e: any) { return { ok: false, detail: "Erro: " + (e?.message || e) }; }
    }
    return { ok: false, detail: "Nenhum armazenamento persistente disponível." };
  }

  readLocalBackup(): AppData | null { const l = readLocal(); return l ? docsToData(l) : null; }
}

function writeLocalProbe(): boolean {
  try { localStorage.setItem("elev-finance:probe", "1"); localStorage.removeItem("elev-finance:probe"); return true; } catch { return false; }
}

// ---------- Backup ----------

export interface BackupFile { app: "elev-finance"; schema: number; exportedAt: string; data: AppData }

export function makeBackup(d: AppData): string {
  const b: BackupFile = { app: "elev-finance", schema: SCHEMA, exportedAt: new Date().toISOString(), data: d };
  return JSON.stringify(b, null, 2);
}

export interface BackupCheck { ok: boolean; errors: string[]; data?: AppData; counts?: Record<string, number>; exportedAt?: string }

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isInt = (v: unknown) => Number.isInteger(v);

export function validateBackup(text: string): BackupCheck {
  const errors: string[] = [];
  let raw: any;
  try { raw = JSON.parse(text); } catch { return { ok: false, errors: ["O arquivo não é um JSON válido."] }; }
  if (!isObj(raw) || raw.app !== "elev-finance") return { ok: false, errors: ["Este arquivo não é um backup do ELEV FINANCE."] };
  if (typeof raw.schema !== "number" || raw.schema > SCHEMA) errors.push(`Versão de backup não suportada (${raw.schema}).`);
  const d = raw.data;
  if (!isObj(d)) return { ok: false, errors: [...errors, "Backup sem a seção de dados."] };
  const sections = ["txs", "recurring", "installments", "cards", "goals"] as const;
  for (const s of sections) if (d[s] != null && !isObj(d[s])) errors.push(`Seção "${s}" inválida.`);
  for (const [id, t] of Object.entries<any>(d.txs || {})) {
    if (!isObj(t) || t.id !== id || !["income", "expense", "transfer"].includes(t.type) || !isInt(t.amountCents) || !isDate(t.date)) { errors.push(`Lançamento inválido: ${id}`); if (errors.length > 8) break; }
  }
  for (const [id, r] of Object.entries<any>(d.recurring || {})) {
    if (!isObj(r) || r.id !== id || !Array.isArray(r.values) || !isDate(r.startDate) || !isObj(r.occurrences)) errors.push(`Recorrência inválida: ${id}`);
  }
  for (const [id, p] of Object.entries<any>(d.installments || {})) {
    if (!isObj(p) || p.id !== id || !isInt(p.installmentCents) || !isInt(p.total) || !isDate(p.firstDueDate) || !isObj(p.payments)) errors.push(`Parcelamento inválido: ${id}`);
  }
  for (const [id, c] of Object.entries<any>(d.cards || {})) if (!isObj(c) || c.id !== id || !isObj(c.invoices)) errors.push(`Cartão inválido: ${id}`);
  for (const [id, g] of Object.entries<any>(d.goals || {})) if (!isObj(g) || g.id !== id || !Array.isArray(g.entries)) errors.push(`Meta inválida: ${id}`);
  if (errors.length) return { ok: false, errors };
  const data: AppData = {
    settings: mergeSettings(isObj(d.settings) ? d.settings : {}),
    txs: d.txs || {}, recurring: d.recurring || {}, installments: d.installments || {}, cards: d.cards || {}, goals: d.goals || {},
    trash: Array.isArray(d.trash) ? d.trash : [],
  };
  return {
    ok: true, errors: [], data, exportedAt: raw.exportedAt,
    counts: { "Lançamentos": Object.keys(data.txs).length, "Recorrentes": Object.keys(data.recurring).length, "Parcelamentos": Object.keys(data.installments).length, "Cartões": Object.keys(data.cards).length, "Metas": Object.keys(data.goals).length },
  };
}

/** Mescla sem duplicar: registros com o mesmo ID não são sobrescritos. */
export function mergeData(cur: AppData, inc: AppData): { data: AppData; added: number; skipped: number } {
  let added = 0, skipped = 0;
  const out: AppData = { ...cur, txs: { ...cur.txs }, recurring: { ...cur.recurring }, installments: { ...cur.installments }, cards: { ...cur.cards }, goals: { ...cur.goals } };
  for (const s of ["txs", "recurring", "installments", "cards", "goals"] as const) {
    for (const [id, v] of Object.entries(inc[s])) {
      if ((out[s] as any)[id]) skipped++; else { (out[s] as any)[id] = v; added++; }
    }
  }
  return { data: out, added, skipped };
}

export function snapshotDocs(d: AppData) { return dataToDocs(d); }
