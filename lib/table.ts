import type { Cells, Column, RowSnap } from "@/lib/types";

export type RenderCell =
  | { kind: "cell"; key: string; text: string; rowSpan: number; colSpan: number }
  | { kind: "covered"; key: string; originRow: number };

/**
 * Convierte las filas (con celdas combinadas guardadas en _span/_colspan)
 * en una matriz lista para dibujar una tabla HTML o una tarjeta por fila.
 */
export function layoutRows(columns: Column[], rows: RowSnap[]): RenderCell[][] {
  const keys = columns.map((c) => c.key);
  const coveredUntil: Record<string, { end: number; origin: number }> = {};
  return rows.map((row, ri) => {
    const out: RenderCell[] = [];
    let skip = 0;
    keys.forEach((key, ci) => {
      if (skip > 0) {
        skip--;
        return;
      }
      const cov = coveredUntil[key];
      if (cov && ri <= cov.end) {
        out.push({ kind: "covered", key, originRow: cov.origin });
        return;
      }
      const cells: Cells = row.cells ?? ({} as Cells);
      const rs = Math.max(1, Number(cells._span?.[key] ?? 1));
      const cs = Math.max(1, Math.min(keys.length - ci, Number(cells._colspan?.[key] ?? 1)));
      if (rs > 1) {
        for (let k = ci; k < ci + cs; k++) coveredUntil[keys[k]] = { end: ri + rs - 1, origin: ri };
      }
      out.push({ kind: "cell", key, text: typeof cells[key] === "string" ? (cells[key] as string) : "", rowSpan: rs, colSpan: cs });
      skip = cs - 1;
    });
    return out;
  });
}

/** Grupos de columnas consecutivas (para la fila superior del encabezado). */
export function columnGroups(columns: Column[]) {
  const groups: { label: string; span: number }[] = [];
  for (const c of columns) {
    const g = c.group ?? "";
    const last = groups[groups.length - 1];
    if (last && last.label === g && g) last.span++;
    else groups.push({ label: g, span: 1 });
  }
  return groups;
}

export const CATEGORY_LABEL: Record<string, string> = {
  componente: "Componente",
  aprendizaje: "Aprendizaje",
  evidencia: "Evidencia",
  instrumento: "Instrumento",
  contenido: "Contenido",
  otra: "Otra",
};
