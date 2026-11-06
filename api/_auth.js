// Comprueba que quien llama es Nina (sesión de Supabase válida).
export async function requireUser(req) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  const base = new URL(process.env.SUPABASE_URL.trim()).origin;
  const r = await fetch(base + "/auth/v1/user", {
    headers: { Authorization: "Bearer " + token, apikey: process.env.SUPABASE_ANON_KEY.trim() }
  });
  if (!r.ok) return null;
  const u = await r.json();
  const allowed = (process.env.ALLOWED_EMAILS || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes((u.email || "").toLowerCase())) return null;
  return u;
}
