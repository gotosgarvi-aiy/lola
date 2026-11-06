// Entrega una sola vez los datos traídos de la Lola de claude.ai.
import { requireUser } from "./_auth.js";
import seed from "./_seed.js";
export default async function handler(req, res) {
  if (!(await requireUser(req))) return res.status(401).json({ code: "not_granted" });
  res.setHeader("Cache-Control", "no-store");
  res.json(seed);
}
