// Downloads pelo recurso oficial do Artifact (o navegador bloqueia <a download> neste ambiente).
export type SaveResult = { ok: true } | { ok: false; reason: "unavailable" | "declined" | "error"; message: string };

let cached: Promise<any> | null = null;
function getDownloads(): Promise<any> {
  if (!cached) {
    cached = (async () => {
      const c = (window as any).claude;
      if (!c?.use) return null;
      try { return await Promise.race([c.use("downloads"), new Promise((r) => setTimeout(() => r(null), 8000))]); } catch { return null; }
    })();
  }
  return cached;
}

export async function downloadsAvailable(): Promise<boolean> { return !!(await getDownloads()); }

export async function saveFile(filename: string, data: string | Uint8Array): Promise<SaveResult> {
  const dl = await getDownloads();
  if (!dl) return { ok: false, reason: "unavailable", message: "Download indisponível nesta visualização." };
  try {
    const payload = typeof data === "string" ? data : new Blob([data as BlobPart]);
    await dl.save({ filename, data: payload });
    return { ok: true };
  } catch (e: any) {
    if (e?.code === "declined") return { ok: false, reason: "declined", message: "Download cancelado." };
    if (e?.code === "unavailable" || e?.code === "not_granted") { cached = null; return { ok: false, reason: "unavailable", message: "Download indisponível nesta visualização." }; }
    return { ok: false, reason: "error", message: e?.message || "Falha no download." };
  }
}
