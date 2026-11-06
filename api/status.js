// Comprueba, paso a paso, que Lola tiene todo lo que necesita (para la página /estado).
import { requireUser } from "./_auth.js";
import { serviceAccount, token, g } from "./google.js";
const SHEET = "1Qz9s709P1Gkqn7y8sDKZAuU9pl0TSOwtWCczB-P2pYY";
const FAMILIA = "family16639309143627778969@group.calendar.google.com";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const out = [];
  const add = (paso, ok, detalle) => out.push({ paso, ok, detalle });
  const user = await requireUser(req).catch(() => null);
  add("Has entrado en Lola", !!user, user ? user.email : "Sin sesión o correo no permitido (ALLOWED_EMAILS)");
  if (!user) return res.json(out);
  add("Clave de la IA (ANTHROPIC_API_KEY)", !!process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_API_KEY ? "puesta" : "falta en Vercel");
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: process.env.MODEL_QUICK || "claude-haiku-5-5", max_tokens: 5, messages: [{ role: "user", content: "Di hola" }] }) });
      const j = await r.json().catch(() => ({}));
      add("La IA contesta", r.ok, r.ok ? "sí" : (j.error && j.error.message) || "error " + r.status);
    } catch (e) { add("La IA contesta", false, e.message); }
  }
  let sa = null;
  try { sa = serviceAccount(); add("Llave de Google (GOOGLE_SERVICE_ACCOUNT_JSON)", true, sa.client_email); }
  catch (e) { add("Llave de Google (GOOGLE_SERVICE_ACCOUNT_JSON)", false, e.message); }
  if (sa) {
    try { await token(); add("Google acepta la llave", true, "sí"); } catch (e) { add("Google acepta la llave", false, e.message); sa = null; }
  }
  if (sa) {
    try { const j = await g("https://sheets.googleapis.com/v4/spreadsheets/" + SHEET + "?fields=properties.title"); add("Lee tu Google Sheets", true, j.properties.title); }
    catch (e) { add("Lee tu Google Sheets", false, e.message + " (¿lo has compartido con " + sa.client_email + "?)"); }
    const prim = process.env.GOOGLE_PRIMARY_CALENDAR;
    add("Tu calendario (GOOGLE_PRIMARY_CALENDAR)", !!prim, prim || "falta en Vercel");
    for (const [n, id] of [["Lee tu calendario", prim], ["Lee el calendario Familia", FAMILIA]]) {
      if (!id) continue;
      try { const j = await g("https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(id) + "?fields=summary"); add(n, true, j.summary); }
      catch (e) { add(n, false, e.message + " (¿lo has compartido con " + sa.client_email + "?)"); }
    }
  }
  res.json(out);
}
