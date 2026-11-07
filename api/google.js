// Lee y escribe en el Google Sheets del menú y lee los calendarios, con una cuenta de servicio de Google.
import crypto from "node:crypto";
import { requireUser } from "./_auth.js";

let tok = { v: "", exp: 0 };
// lee la llave de la cuenta de servicio aunque al pegarla se hayan colado comillas tipográficas o espacios
export function serviceAccount() {
  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim().replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'");
  if (!raw) throw new Error("falta GOOGLE_SERVICE_ACCOUNT_JSON");
  const sa = JSON.parse(raw);
  sa.private_key = String(sa.private_key || "").replace(/\\n/g, "\n");
  return sa;
}
export async function token() {
  if (tok.exp > Date.now() + 60000) return tok.v;
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "RS256", typ: "JWT" });
  const body = b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/calendar", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const sig = crypto.createSign("RSA-SHA256").update(head + "." + body).sign(sa.private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: head + "." + body + "." + sig })
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("google: " + JSON.stringify(j));
  tok = { v: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return tok.v;
}
export async function g(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { Authorization: "Bearer " + (await token()), "content-type": "application/json", ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j.error && j.error.message) || "google"); e.status = r.status; throw e; }
  return j;
}
// "2026-11-02T00:00:00" (hora de Valencia) -> con su desfase horario
function madrid(s) {
  if (/[zZ]|[+-]\d\d:\d\d$/.test(s)) return s;
  const d = new Date(s + "Z");
  const off = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Madrid" })) - new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const h = Math.round(off / 3600000);
  return s + (h >= 0 ? "+" : "-") + String(Math.abs(h)).padStart(2, "0") + ":00";
}
const S = "https://sheets.googleapis.com/v4/spreadsheets/";
const tools = {
  "Google Sheets": {
    get_values: a => g(S + a.spreadsheetId + "/values/" + encodeURIComponent(a.range) + "?valueRenderOption=FORMATTED_VALUE"),
    update_values: a => g(S + a.spreadsheetId + "/values/" + encodeURIComponent(a.range) + "?valueInputOption=USER_ENTERED", { method: "PUT", body: JSON.stringify({ values: a.values }) }),
    update_formulas: a => g(S + a.spreadsheetId + "/values/" + encodeURIComponent(a.range) + "?valueInputOption=USER_ENTERED", { method: "PUT", body: JSON.stringify({ values: a.formulas }) }),
    append_values: a => g(S + a.spreadsheetId + "/values/" + encodeURIComponent(a.range) + ":append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS", { method: "POST", body: JSON.stringify({ values: a.values }) }),
    get_spreadsheet: a => g(S + a.spreadsheetId + (a.fields ? "?fields=" + encodeURIComponent([].concat(a.fields).join(",")) : "")),
    update_spreadsheet: a => g(S + a.spreadsheetId + ":batchUpdate", { method: "POST", body: JSON.stringify({ requests: a.requests }) })
  },
  "Google Calendar": {
    list_events: a => {
      const id = a.calendarId === "primary" ? process.env.GOOGLE_PRIMARY_CALENDAR : a.calendarId;
      const q = new URLSearchParams({ singleEvents: "true", orderBy: a.orderBy || "startTime", maxResults: String(a.pageSize || 100), timeZone: "Europe/Madrid" });
      if (a.startTime) q.set("timeMin", madrid(a.startTime));
      if (a.endTime) q.set("timeMax", madrid(a.endTime));
      (a.eventType || []).forEach(t => q.append("eventTypes", t === "BIRTHDAY" ? "birthday" : t === "FROM_GMAIL" ? "fromGmail" : t === "OUT_OF_OFFICE" ? "outOfOffice" : "default"));
      return g("https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(id) + "/events?" + q);
    },
    // crea un evento: date "AAAA-MM-DD", time "HH:MM" (vacío = todo el día), durationMin
    create_event: a => {
      const id = a.calendarId === "primary" ? process.env.GOOGLE_PRIMARY_CALENDAR : a.calendarId;
      let start, end;
      if (a.time) {
        const [h, m] = a.time.split(":").map(Number);
        const t0 = h * 60 + m, t1 = t0 + (Number(a.durationMin) || 90);
        const hh = x => String(Math.floor(x / 60) % 24).padStart(2, "0") + ":" + String(x % 60).padStart(2, "0");
        const endDate = t1 >= 1440 ? new Date(Date.parse(a.date + "T00:00:00Z") + 86400000).toISOString().slice(0, 10) : a.date;
        start = { dateTime: a.date + "T" + hh(t0) + ":00", timeZone: "Europe/Madrid" };
        end = { dateTime: endDate + "T" + hh(t1) + ":00", timeZone: "Europe/Madrid" };
      } else {
        start = { date: a.date };
        end = { date: new Date(Date.parse(a.date + "T00:00:00Z") + 86400000).toISOString().slice(0, 10) };
      }
      return g("https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(id) + "/events", { method: "POST", body: JSON.stringify({ summary: a.summary, description: "Apuntado por Lola", start, end }) });
    },
    delete_event: async a => {
      const id = a.calendarId === "primary" ? process.env.GOOGLE_PRIMARY_CALENDAR : a.calendarId;
      const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(id) + "/events/" + encodeURIComponent(a.eventId), { method: "DELETE", headers: { Authorization: "Bearer " + (await token()) } });
      if (!r.ok && r.status !== 410) throw new Error("no se ha podido borrar");
      return { ok: true };
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!(await requireUser(req))) return res.status(401).json({ code: "not_granted" });
  const { server, tool, args } = req.body || {};
  const fn = tools[server] && tools[server][tool];
  if (!fn) return res.status(400).json({ code: "tool", message: server + "/" + tool });
  try { res.json(await fn(args || {})); }
  catch (e) { res.status(e.status === 403 ? 403 : 502).json({ code: e.status === 403 ? "not_granted" : "error", message: e.message }); }
}
