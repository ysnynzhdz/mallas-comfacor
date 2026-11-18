/** Utilidades de texto para el buscador: ignorar tildes y resaltar coincidencias. */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Raíces de las palabras buscadas (primeras letras), sin palabras vacías. */
export function queryStems(q: string): string[] {
  const stop = new Set(["de", "la", "el", "los", "las", "y", "o", "en", "con", "por", "para", "del", "al", "un", "una", "que"]);
  return fold(q)
    .replace(/["']/g, " ")
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 2 && !stop.has(w))
    .map((w) => (w.length > 5 ? w.slice(0, Math.max(4, w.length - 2)) : w));
}

export type Piece = { text: string; hit: boolean };

/** Devuelve un fragmento de `text` alrededor de la primera coincidencia, partido en trozos resaltados. */
export function snippet(text: string, stems: string[], radius = 110): Piece[] | null {
  if (!text || !stems.length) return null;
  const f = fold(text);
  const ranges: [number, number][] = [];
  for (const s of stems) {
    const re = new RegExp(`(^|[^a-z0-9ñ])(${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[a-z0-9ñ]*)`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(f))) ranges.push([m.index + m[1].length, m.index + m[1].length + m[2].length]);
  }
  if (!ranges.length) return null;
  ranges.sort((a, b) => a[0] - b[0]);
  const start = Math.max(0, ranges[0][0] - radius);
  const end = Math.min(text.length, ranges[0][1] + radius * 2);
  const out: Piece[] = [];
  let pos = start;
  if (start > 0) out.push({ text: "…", hit: false });
  for (const [a, b] of ranges) {
    if (a < pos || a >= end) continue;
    if (a > pos) out.push({ text: text.slice(pos, a), hit: false });
    out.push({ text: text.slice(a, Math.min(b, end)), hit: true });
    pos = Math.min(b, end);
  }
  if (pos < end) out.push({ text: text.slice(pos, end), hit: false });
  if (end < text.length) out.push({ text: "…", hit: false });
  return out;
}
