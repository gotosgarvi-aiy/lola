// Pasa las preguntas de Lola a la API de Anthropic y devuelve el texto según llega.
import { requireUser } from "./_auth.js";
import { anthropicKey, hide } from "./_keys.js";

const MODELS = {
  default: process.env.MODEL_DEFAULT || "claude-sonnet-5-5",
  quick: process.env.MODEL_QUICK || "claude-haiku-5-5"
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const user = await requireUser(req);
  if (!user) return res.status(401).send("sin sesión");
  const { prompt, tier = "default", images = [], maxTokens } = req.body || {};
  if (!prompt) return res.status(400).send("falta la pregunta");

  const content = [
    ...images.slice(0, 4).map(i => ({ type: "image", source: { type: "base64", media_type: i.media_type, data: i.data } })),
    { type: "text", text: String(prompt).slice(0, 60000) }
  ];
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": anthropicKey(), "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODELS[tier] || MODELS.default, max_tokens: Math.min(maxTokens || 8000, 16000), stream: true, messages: [{ role: "user", content }] })
  });
  if (r.status === 429) return res.status(429).send("límite");
  if (!r.ok) return res.status(502).send(hide(await r.text()));

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = "", stop = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      let ev; try { ev = JSON.parse(line.slice(5)); } catch { continue; }
      if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") res.write(ev.delta.text);
      if (ev.type === "message_delta" && ev.delta && ev.delta.stop_reason) stop = ev.delta.stop_reason;
    }
  }
  res.end("\u0000" + stop);
}
