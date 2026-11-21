// Simula o runtime do Artifact: db privado persistido no localStorage do teste (sobrevive a reload).
(() => {
  const KEY = "__mockdb";
  const load = () => JSON.parse(localStorage.getItem(KEY) || "{}");
  const saveAll = (o) => localStorage.setItem(KEY, JSON.stringify(o));
  const listeners = new Set();
  const delay = (v) => new Promise((r) => setTimeout(() => r(v), 30));
  window.__writes = 0;
  function snapshotFor(prefix) {
    const all = load();
    const docs = Object.keys(all).filter((k) => k.startsWith(prefix + "/") && k.split("/").length === prefix.split("/").length + 1)
      .map((k) => ({ id: k.split("/").pop(), exists: true, data: () => JSON.parse(JSON.stringify(all[k])), metadata: { fromCache: false, hasPendingWrites: false } }));
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
  }
  const emit = () => { if (window.__pauseSnapshots) return; listeners.forEach((l) => setTimeout(() => l.cb(snapshotFor(l.prefix)), 10)); };
  window.addEventListener("storage", (e) => { if (e.key === KEY) emit(); }); // outra aba = outro "dispositivo"
  window.__resume = () => { window.__pauseSnapshots = false; emit(); };
  const deepMerge = (a, b) => { const o = { ...(a || {}) }; for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === "object" && !Array.isArray(v) && o[k] && typeof o[k] === "object" && !Array.isArray(o[k]) ? deepMerge(o[k], v) : v; return o; };
  const db = {
    collection(path) {
      return {
        path,
        doc(id) {
          const full = path + "/" + id;
          return {
            id, path: full,
            async get() { await delay(); const all = load(); return { id, exists: full in all, data: () => all[full], metadata: { fromCache: false } }; },
            async set(v) { await delay(); if (window.__failWrites) throw { code: "unavailable", message: "simulado" }; const all = load(); all[full] = JSON.parse(JSON.stringify(v)); saveAll(all); window.__writes++; emit(); },
            async update(v) { await delay(); const all = load(); if (!(full in all)) throw { code: "invalid_argument", message: "não existe" }; all[full] = deepMerge(all[full], JSON.parse(JSON.stringify(v))); saveAll(all); window.__writes++; window.__updates = (window.__updates || 0) + 1; emit(); },
            async delete() { await delay(); const all = load(); delete all[full]; saveAll(all); emit(); },
          };
        },
        async get() { await delay(); return snapshotFor(path); },
        onSnapshot(cb, err) { const l = { prefix: path, cb }; listeners.add(l); setTimeout(() => cb(snapshotFor(path)), 50); return () => listeners.delete(l); },
      };
    },
  };
  window.__downloads = [];
  const downloads = { async save({ filename, data }) { const text = typeof data === "string" ? data : await data.text?.() ?? "[binary]"; window.__downloads.push({ filename, size: typeof data === "string" ? data.length : data.size, head: String(text).slice(0, 200) }); return { status: "saved" }; } };
  const user = { async id() { return "u_test"; }, async isOwner() { return true; } };
  window.claude = { use: async (n) => (n === "db" ? db : n === "user" ? user : n === "downloads" ? downloads : null) };
})();
