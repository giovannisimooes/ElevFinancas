// Sincronização para a versão aberta FORA do Claude (ex.: GitHub Pages):
// os dados ficam num Gist secreto da conta do GitHub do usuário, acessado com um token pessoal.
// O token fica só no navegador de cada aparelho (localStorage).

export const GIST_FILE = "elev-finance.json";
export const GIST_DESC = "ELEV FINANCE — dados (não apagar)";
const API = "https://api.github.com";
const CFG_KEY = "elev-finance:gist";
const CACHE_KEY = "elev-finance:gist-cache";

export interface GistCfg { token: string; gistId: string; login?: string }

export function readGistCfg(): GistCfg | null {
  try { const r = localStorage.getItem(CFG_KEY); const c = r ? JSON.parse(r) : null; return c?.token && c?.gistId ? c : null; } catch { return null; }
}
export function writeGistCfg(c: GistCfg | null) {
  try { if (c) localStorage.setItem(CFG_KEY, JSON.stringify(c)); else localStorage.removeItem(CFG_KEY); } catch { /* ignora */ }
}
export function readGistCache(): string | null { try { return localStorage.getItem(CACHE_KEY); } catch { return null; } }
export function writeGistCache(s: string) { try { localStorage.setItem(CACHE_KEY, s); } catch { /* ignora */ } }

export class GistError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

async function gh(token: string, path: string, init: RequestInit = {}): Promise<any> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      ...init, cache: "no-store",
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token.trim()}`, "X-GitHub-Api-Version": "2022-11-28", ...(init.body ? { "Content-Type": "application/json" } : {}) },
    });
  } catch {
    throw new GistError("Sem conexão com o GitHub.", 0);
  }
  if (res.status === 401) throw new GistError("Token inválido ou expirado.", 401);
  if (res.status === 403 || res.status === 429) throw new GistError("O GitHub recusou o acesso (token sem permissão de Gist ou limite de uso).", res.status);
  if (res.status === 404) throw new GistError("Gist não encontrado (foi apagado ou o token não tem acesso a ele).", 404);
  if (!res.ok) throw new GistError(`Erro do GitHub (${res.status}).`, res.status);
  return res.status === 204 ? null : res.json();
}

/** Lê o conteúdo do arquivo de dados do Gist. */
export async function gistRead(cfg: GistCfg): Promise<{ content: string; updatedAt: string }> {
  const g = await gh(cfg.token, `/gists/${cfg.gistId}`);
  const f = g?.files?.[GIST_FILE];
  if (!f) throw new GistError("O Gist não contém o arquivo de dados do ELEV FINANCE.", 404);
  let content: string = f.content ?? "";
  if (f.truncated && f.raw_url) {
    const r = await fetch(f.raw_url, { cache: "no-store" });
    if (!r.ok) throw new GistError("Não foi possível baixar o arquivo de dados completo.", r.status);
    content = await r.text();
  }
  return { content, updatedAt: g.updated_at };
}

export async function gistWrite(cfg: GistCfg, content: string): Promise<string> {
  const g = await gh(cfg.token, `/gists/${cfg.gistId}`, { method: "PATCH", body: JSON.stringify({ files: { [GIST_FILE]: { content } } }) });
  return g?.updated_at || new Date().toISOString();
}

/** Valida o token e encontra o Gist de dados da conta (ou cria um, secreto, com `initial`). */
export async function gistConnect(token: string, initial: () => string): Promise<{ cfg: GistCfg; created: boolean }> {
  const user = await gh(token, "/user");
  for (let page = 1; page <= 5; page++) {
    const list: any[] = await gh(token, `/gists?per_page=100&page=${page}`);
    const found = list.find((g) => g.files?.[GIST_FILE]);
    if (found) return { cfg: { token: token.trim(), gistId: found.id, login: user?.login }, created: false };
    if (list.length < 100) break;
  }
  const g = await gh(token, "/gists", { method: "POST", body: JSON.stringify({ description: GIST_DESC, public: false, files: { [GIST_FILE]: { content: initial() } } }) });
  return { cfg: { token: token.trim(), gistId: g.id, login: user?.login }, created: true };
}
