// Datos públicos que necesita la página para hablar con Supabase.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({ supabaseUrl: process.env.SUPABASE_URL, supabaseAnonKey: process.env.SUPABASE_ANON_KEY });
}
