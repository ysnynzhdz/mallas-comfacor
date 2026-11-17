import type { Cells, Column, RowSnap } from "@/lib/types";

/** Para cada fila y columna: índice de la fila que contiene la celda combinada que la cubre (o null). */
export function coverMap(columns: Column[], rows: RowSnap[]): (number | null)[][] {
  const keys = columns.map((c) => c.key);
  const until: Record<string, { end: number; origin: number }> = {};
  return rows.map((r, ri) =>
    keys.map((k) => {
      const u = until[k];
      if (u && ri <= u.end && u.origin !== ri) return u.origin;
      const s = Number(r.cells?._span?.[k] ?? 1);
      if (s > 1) until[k] = { end: ri + s - 1, origin: ri };
      return null;
    }),
  );
}

function clone(rows: RowSnap[]): RowSnap[] {
  return rows.map((r) => ({
    ...r,
    cells: {
      ...r.cells,
      ...(r.cells._span ? { _span: { ...r.cells._span } } : {}),
      ...(r.cells._colspan ? { _colspan: { ...r.cells._colspan } } : {}),
    } as Cells,
  }));
}

function setSpan(c: Cells, key: string, n: number) {
  const span = { ...(c._span ?? {}) };
  if (n <= 1) delete span[key];
  else span[key] = n;
  if (Object.keys(span).length) c._span = span;
  else delete c._span;
}

/** Agrega una fila vacía debajo de la fila i, respetando las celdas combinadas. */
export function addRowAfter(columns: Column[], rows: RowSnap[], i: number): RowSnap[] {
  const out = clone(rows);
  const cover = coverMap(columns, out);
  const cells = {} as Cells;
  columns.forEach((col, ci) => {
    const origin = cover[i]?.[ci] ?? (Number(out[i]?.cells._span?.[col.key] ?? 1) > 1 ? i : null);
    if (origin !== null && origin !== undefined) {
      const span = Number(out[origin].cells._span?.[col.key] ?? 1);
      if (origin + span - 1 > i) {
        setSpan(out[origin].cells, col.key, span + 1); // la nueva fila queda dentro de la celda combinada
        return;
      }
    }
    cells[col.key] = "";
  });
  out.splice(i + 1, 0, { cells });
  return out;
}

/** Elimina la fila i; si era el inicio de una celda combinada, el texto pasa a la fila siguiente. */
export function deleteRow(columns: Column[], rows: RowSnap[], i: number): RowSnap[] {
  const out = clone(rows);
  const cover = coverMap(columns, out);
  columns.forEach((col, ci) => {
    const origin = cover[i][ci];
    if (origin !== null) {
      setSpan(out[origin].cells, col.key, Number(out[origin].cells._span?.[col.key] ?? 1) - 1);
    } else {
      const span = Number(out[i].cells._span?.[col.key] ?? 1);
      if (span > 1 && out[i + 1]) {
        out[i + 1].cells[col.key] = out[i].cells[col.key] ?? "";
        setSpan(out[i + 1].cells, col.key, span - 1);
      }
    }
  });
  out.splice(i, 1);
  return out;
}

export function setCell(rows: RowSnap[], i: number, key: string, value: string): RowSnap[] {
  return rows.map((r, ri) => (ri === i ? { ...r, cells: { ...r.cells, [key]: value } as Cells } : r));
}
