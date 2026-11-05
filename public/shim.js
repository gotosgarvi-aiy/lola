/* Capa de compatibilidad: imita claude.use("db"|"sample"|"mcp"|"assets") de claude.ai
   usando Supabase (datos, fotos, inicio de sesión) y las funciones /api de Vercel (IA y Google). */
(function () {
  "use strict";
  let sb = null, session = null, readyResolve;
  const ready = new Promise(r => (readyResolve = r));

  /* ---------- inicio de sesión con código por correo (funciona dentro de la app instalada) ---------- */
  function loginScreen() {
    const box = document.createElement("div");
    box.id = "lolaLogin";
    box.style.cssText = "position:fixed;inset:0;z-index:99999;background:#111a2e;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;font:16px -apple-system,sans-serif;text-align:center";
    box.innerHTML = `<img src="/icons/icon-192.png" style="width:96px;height:96px;border-radius:22px">
      <h2 style="margin:0">Hola, soy Lola</h2>
      <p id="lgMsg" style="margin:0;opacity:.8;max-width:300px">Escribe tu correo y te mando un código para entrar.</p>
      <input id="lgMail" type="email" autocomplete="email" placeholder="tu correo" style="font-size:18px;padding:12px;border-radius:12px;border:0;width:min(300px,90vw)">
      <input id="lgCode" inputmode="numeric" autocomplete="one-time-code" placeholder="código" hidden style="font-size:22px;letter-spacing:4px;text-align:center;padding:12px;border-radius:12px;border:0;width:min(300px,90vw)">
      <button id="lgBtn" style="font-size:18px;padding:12px 28px;border-radius:12px;border:0;background:#f5c542;color:#111;font-weight:700">Enviar código</button>`;
    document.body.appendChild(box);
    const $ = id => box.querySelector("#" + id);
    let sent = false;
    $("lgBtn").onclick = async () => {
      const email = $("lgMail").value.trim();
      if (!sent) {
        const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
        if (error) { $("lgMsg").textContent = "No he podido enviar el código: " + error.message; return; }
        sent = true; $("lgCode").hidden = false; $("lgCode").focus();
        $("lgMsg").textContent = "Te he mandado un código al correo. Escríbelo aquí."; $("lgBtn").textContent = "Entrar";
      } else {
        const { error } = await sb.auth.verifyOtp({ email, token: $("lgCode").value.trim(), type: "email" });
        if (error) { $("lgMsg").textContent = "El código no vale: " + error.message; return; }
      }
    };
  }

  async function boot() {
    const cfg = await fetch("/api/config").then(r => r.json());
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await sb.auth.getSession();
    session = data.session;
    sb.auth.onAuthStateChange((_e, s) => {
      session = s;
      if (s) { const l = document.getElementById("lolaLogin"); if (l) l.remove(); readyResolve(); }
    });
    if (session) readyResolve(); else loginScreen();
  }
  const booted = boot().catch(e => { console.error(e); readyResolve(); });

  const authHeaders = () => (session ? { Authorization: "Bearer " + session.access_token } : {});

  /* ---------- db: colecciones y documentos tipo Firestore sobre la tabla "docs" ---------- */
  const TABLE = "docs";
  const listeners = {}; // col -> Set(fn)
  const cache = {};     // col -> Map(id -> data)
  let channel = null;

  function snapOf(col) {
    const m = cache[col] || new Map();
    return { docs: [...m.entries()].map(([id, data]) => ({ id, data: () => data, exists: true })), size: m.size, empty: !m.size };
  }
  function emit(col) { (listeners[col] || new Set()).forEach(fn => { try { fn(snapOf(col)); } catch (e) { console.error(e); } }); }

  async function loadCol(col) {
    const { data, error } = await sb.from(TABLE).select("id,data").eq("col", col);
    if (error) throw error;
    cache[col] = new Map(data.map(r => [r.id, r.data]));
  }
  function ensureChannel() {
    if (channel) return;
    channel = sb.channel("docs-cambios").on("postgres_changes", { event: "*", schema: "public", table: TABLE }, p => {
      const row = p.new && p.new.col ? p.new : p.old;
      if (!row || !row.col || !cache[row.col]) return;
      if (p.eventType === "DELETE") cache[row.col].delete(row.id); else cache[row.col].set(row.id, p.new.data);
      emit(row.col);
    }).subscribe();
  }
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  function local(col, id, data) { if (!cache[col]) return; if (data === null) cache[col].delete(id); else cache[col].set(id, data); emit(col); }

  function docRef(col, id) {
    return {
      id,
      async get() {
        const { data, error } = await sb.from(TABLE).select("data").eq("col", col).eq("id", id).maybeSingle();
        if (error) throw error;
        return { id, exists: !!data, data: () => (data ? data.data : undefined) };
      },
      async set(obj) {
        local(col, id, obj);
        const { error } = await sb.from(TABLE).upsert({ col, id, data: obj, updated_at: new Date().toISOString() });
        if (error) throw error;
      },
      async update(patch) {
        const cur = (cache[col] && cache[col].get(id)) || (await this.get()).data() || {};
        await this.set({ ...cur, ...patch });
      },
      async delete() {
        local(col, id, null);
        const { error } = await sb.from(TABLE).delete().eq("col", col).eq("id", id);
        if (error) throw error;
      },
      onSnapshot(fn, onErr) {
        return collection(col).onSnapshot(s => {
          const d = s.docs.find(x => x.id === id);
          fn({ id, exists: !!d, data: () => (d ? d.data() : undefined) });
        }, onErr);
      }
    };
  }
  function collection(col) {
    return {
      doc: id => docRef(col, id == null ? newId() : String(id)),
      async add(obj) { const r = docRef(col, newId()); await r.set(obj); return r; },
      onSnapshot(fn, onErr) {
        (listeners[col] = listeners[col] || new Set()).add(fn);
        ensureChannel();
        (cache[col] ? Promise.resolve() : loadCol(col)).then(() => fn(snapOf(col))).catch(e => onErr && onErr({ code: e.code || "error" }));
        return () => listeners[col].delete(fn);
      }
    };
  }
  const db = { collection, doc: path => { const [c, ...rest] = path.split("/"); return docRef(c, rest.join("/")); } };

  /* ---------- sample: preguntas a la IA por /api/ai (con texto en directo) ---------- */
  async function toImage(blob) {
    // reduce fotos grandes para que quepan en la petición (máx. 1568 px, JPEG)
    if (blob.type === "application/pdf") return null;
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const url = c.toDataURL("image/jpeg", 0.85);
    return { media_type: "image/jpeg", data: url.split(",")[1] };
  }
  async function sample(prompt, opts = {}) {
    await ready;
    const images = [];
    for (const b of opts.images || []) { const i = await toImage(b); if (i) images.push(i); }
    const res = await fetch("/api/ai", {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ prompt, tier: opts.modelTier || "default", images, maxTokens: opts.maxTokens })
    });
    if (res.status === 429) throw { code: "rate_limited" };
    if (!res.ok) throw { code: "error", message: await res.text() };
    const reader = res.body.getReader(), dec = new TextDecoder();
    let text = "", truncated = false;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += dec.decode(value, { stream: true });
      const i = text.indexOf("\u0000");
      if (opts.onText) opts.onText({ text: i >= 0 ? text.slice(0, i) : text });
    }
    const i = text.indexOf("\u0000");
    if (i >= 0) { truncated = text.slice(i + 1).includes("max_tokens"); text = text.slice(0, i); }
    return { text, truncated };
  }
  sample.json = async (prompt, opts = {}) => {
    const r = await sample(prompt + "\n\nResponde solo con JSON válido, sin texto alrededor.", opts);
    const m = r.text.match(/[\[{][\s\S]*[\]}]/);
    if (!m) throw { code: "parse" };
    return JSON.parse(m[0]);
  };
  sample.limits = async () => ({ images: true });

  /* ---------- mcp: Google Sheets y Calendar por /api/google ---------- */
  const memo = new Map();
  async function callTool(server, tool, args, o = {}) {
    await ready;
    const key = JSON.stringify([server, tool, args]);
    const c = o.cache && memo.get(key);
    if (c && Date.now() - c.t < (o.cache.staleTime || 0)) return c.v;
    const res = await fetch("/api/google", {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ server, tool, args })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw { code: j.code || "error", message: j.message };
    const v = { payload: j };
    if (o.cache) memo.set(key, { t: Date.now(), v });
    return v;
  }
  function watchTool(server, tool, args, cb, o = {}) {
    let stop = false;
    const run = () => callTool(server, tool, args, { cache: false })
      .then(result => { if (!stop) { memo.set(JSON.stringify([server, tool, args]), { t: Date.now(), v: result }); cb({ type: "data", result }); } })
      .catch(error => !stop && cb({ type: "error", error }));
    run();
    const t = setInterval(run, o.refetchInterval || 15 * 60 * 1000);
    const vis = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }
  const mcp = { callTool, watchTool };

  /* ---------- assets: fotos en Supabase Storage ---------- */
  const assets = {
    async upload(blob) {
      await ready;
      const id = newId(), path = session.user.id + "/" + id + (blob.type === "image/png" ? ".png" : ".jpg");
      const { error } = await sb.storage.from("fotos").upload(path, blob, { contentType: blob.type || "image/jpeg" });
      if (error) throw error;
      const { data } = await sb.storage.from("fotos").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      return { id, url: data.signedUrl };
    }
  };

  const services = { db, sample, mcp, assets };
  window.claude = {
    use: async name => { await booted; await ready; return services[name] || null; },
    supabase: () => sb,
    session: () => session
  };
})();
