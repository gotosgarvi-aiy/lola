// Saca la clave de Anthropic aunque se haya pegado con texto alrededor (por ejemplo, un ejemplo de curl entero).
export function anthropicKey() {
  const raw = process.env.ANTHROPIC_API_KEY || "";
  const m = raw.match(/sk-ant-[A-Za-z0-9_\-]+/);
  return m ? m[0] : raw.trim();
}
// Quita cualquier clave de un texto antes de enseñarlo.
export const hide = s => String(s || "").replace(/sk-ant-[A-Za-z0-9_\-]+/g, "sk-ant-…");
