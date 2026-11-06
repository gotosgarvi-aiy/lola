# Lola

Asistente personal y familiar de Nina, como app web instalable (PWA).

- Código: este repositorio. Cada cambio en `main` se publica solo en Vercel.
- Datos, inicio de sesión y fotos: Supabase (`supabase/schema.sql`).
- IA: API de Anthropic (`api/ai.js`). Google Sheets y Calendar: `api/google.js`.
- `public/shim.js` imita las funciones de claude.ai que usaba la versión anterior.

Variables en Vercel: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ALLOWED_EMAILS`, `ANTHROPIC_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_PRIMARY_CALENDAR`.
