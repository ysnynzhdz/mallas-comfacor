import type { Snapshot } from "@/lib/types";

/**
 * División de una unidad de Matemáticas en asignaturas, SIN cambiar ni inventar texto:
 *  - 1° a 9°: cada fila ya pertenece a un pensamiento (numérico-variacional, espacial-métrico, aleatorio);
 *    las celdas combinadas que abarcan varios pensamientos (p. ej. instrumentos) se copian en cada asignatura.
 *  - 10° y 11°: la columna de contenidos ya viene separada por «Componente …»; cada asignatura recibe su
 *    componente y las demás columnas (competencias, aprendizajes, evidencias, instrumentos) completas.
 */
export const MATH_SUBJECTS: Record<string, [string, string, string]> = {
  sexto: ["Aritmética", "Geometría", "Estadística"],
  septimo: ["Aritmética", "Geometría", "Estadística"],
  octavo: ["Álgebra", "Geometría", "Estadística"],
  noveno: ["Álgebra", "Geometría", "Estadística"],
  decimo: ["Trigonometría", "Geometría", "Estadística"],
  undecimo: ["Cálculo", "Geometría", "Estadística"],
};
export const SUBJECT_ORDER: Record<string, number> = { Aritmética: 1, Álgebra: 2, Trigonometría: 3, Cálculo: 4, Geometría: 5, Estadística: 6 };

type Cells = Record<string, unknown> & { _span?: Record<string, number> };
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

function componentOfRow(c1: string): 0 | 1 | 2 | -1 {
  const f = fold(c1);
  if (/ALEATORIO/.test(f)) return 2;
  if (/METRICO|ESPACIAL/.test(f)) return 1;
  if (/NUMERICO|VARIACIONAL/.test(f)) return 0;
  return -1;
}

/** Parte las filas por grupos, recortando o copiando las celdas combinadas que cruzan de un grupo a otro. */
function splitRows(rows: Cells[], groupOf: number[], groups: number) {
  // dueño de cada (fila, columna): la fila donde está escrito el texto
  const owner: Record<string, { row: number; key: string }> = {};
  rows.forEach((r, i) => {
    for (const k of Object.keys(r)) {
      if (k.startsWith("_")) continue;
      const span = r._span?.[k] ?? 1;
      for (let j = i; j < i + span && j < rows.length; j++) owner[`${j}|${k}`] = { row: i, key: k };
    }
  });
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r).filter((k) => !k.startsWith("_"))))];
  const out: Cells[][] = Array.from({ length: groups }, () => []);
  for (let g = 0; g < groups; g++) {
    const idx = rows.map((_, i) => i).filter((i) => groupOf[i] === g);
    idx.forEach((i, pos) => {
      const cell: Cells = {};
      const span: Record<string, number> = {};
      for (const k of keys) {
        const o = owner[`${i}|${k}`];
        if (!o) continue;
        const firstInGroup = o.row === i || (pos === 0 ? true : !idx.slice(0, pos).some((j) => owner[`${j}|${k}`]?.row === o.row));
        if (!firstInGroup) continue;
        cell[k] = rows[o.row][k];
        const cover = idx.slice(pos).filter((j) => owner[`${j}|${k}`]?.row === o.row).length;
        if (cover > 1) span[k] = cover;
      }
      if (Object.keys(span).length) cell._span = span;
      out[g].push(cell);
    });
  }
  return out;
}

/** Corta el texto de contenidos por los encabezados «Componente …». Devuelve [numérico, espacial, aleatorio] o null. */
function splitContents(text: string): [string, string, string] | null {
  const re = /^Componente [^\n]*$/gm;
  const marks = [...text.matchAll(re)].map((m) => ({ at: m.index!, comp: componentOfRow(m[0]) }));
  if (marks.length !== 3 || marks.some((m) => m.comp < 0) || new Set(marks.map((m) => m.comp)).size !== 3) return null;
  if (text.slice(0, marks[0].at).trim()) return null; // texto antes del primer componente: no se divide
  const parts: string[] = ["", "", ""];
  marks.forEach((m, i) => {
    parts[m.comp] = text.slice(m.at, i + 1 < marks.length ? marks[i + 1].at : text.length).replace(/\s+$/, "");
  });
  return parts as [string, string, string];
}

export function splitMathUnit(grade: string, snap: Snapshot): { subject: string; order: number; snapshot: Snapshot }[] | { error: string } {
  const names = MATH_SUBJECTS[grade];
  if (!names) return { error: "Grado sin división definida" };
  const rows = snap.rows.map((r) => ({ ...(r.cells as Cells) }));
  const base = (cells: Cells[]): Snapshot => ({ ...snap, rows: cells.map((c) => ({ cells: c as never })) });
  let parts: Cells[][];

  const contentCol = snap.columns.find((c) => c.category === "contenido")?.key;
  const firstCol = snap.columns[0]?.key;
  const byRows = firstCol ? rows.map((r) => componentOfRow(String(r[firstCol] ?? ""))) : [];

  if (byRows.length && byRows.every((g) => g >= 0) && new Set(byRows).size === 3) {
    parts = splitRows(rows, byRows, 3);
  } else if (contentCol) {
    const owner = rows.findIndex((r) => typeof r[contentCol] === "string");
    const span = rows[owner]?._span?.[contentCol] ?? 1;
    if (owner !== 0 || span !== rows.length) return { error: "La columna de contenidos no cubre toda la tabla" };
    const pieces = splitContents(String(rows[0][contentCol]));
    if (!pieces) return { error: "Los contenidos no están separados por componente" };
    parts = pieces.map((t) => rows.map((r, i) => (i === 0 ? { ...r, [contentCol]: t } : { ...r })));
  } else return { error: "Estructura no reconocida" };

  return names.map((n, i) => ({ subject: n, order: SUBJECT_ORDER[n], snapshot: base(parts[i]) }));
}
