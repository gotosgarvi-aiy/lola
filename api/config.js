// Datos públicos que necesita la página para hablar con Supabase.
export default function handler(req, res) {
  let url = (process.env.SUPABASE_URL || "").trim();
  try { url = new URL(url).origin; } catch {} // quita barras o rutas sobrantes (/rest/v1/…)
  res.setHeader("Cache-Control", "no-store");
  res.json({ supabaseUrl: url, supabaseAnonKey: (process.env.SUPABASE_ANON_KEY || "").trim() });
}
