import type { Column, RowSnap, Snapshot } from "@/lib/types";

export type FieldChange = { label: string; before: string; after: string };
export type RowChange =
  | { kind: "agregada"; after: RowSnap; index: number }
  | { kind: "eliminada"; before: RowSnap; index: number }
  | { kind: "modificada"; before: RowSnap; after: RowSnap; index: number; cells: { key: string; label: string; before: string; after: string }[] }
  | { kind: "igual"; after: RowSnap; index: number };

const txt = (v: unknown) => (typeof v === "string" ? v : "");

/** Compara dos fotografías del mismo proyecto. Las filas se emparejan por su identificador real. */
export function diffSnapshots(before: Snapshot, after: Snapshot) {
  const fields: FieldChange[] = [];
  if (before.name !== after.name) fields.push({ label: "Nombre", before: before.name, after: after.name });
  if (before.purpose !== after.purpose) fields.push({ label: after.purpose_label, before: before.purpose, after: after.purpose });
  const n = Math.max(before.header_fields.length, after.header_fields.length);
  for (let i = 0; i < n; i++) {
    const b = before.header_fields[i];
    const a = after.header_fields[i];
    if ((b?.value ?? "") !== (a?.value ?? "")) fields.push({ label: a?.label || b?.label || "Encabezado", before: b?.value ?? "", after: a?.value ?? "" });
  }
  const cols: Column[] = after.columns.length ? after.columns : before.columns;
  const byId = new Map(before.rows.filter((r) => r.id).map((r) => [r.id!, r]));
  const seen = new Set<string>();
  const rows: RowChange[] = [];
  after.rows.forEach((r, i) => {
    const b = r.id ? byId.get(r.id) : undefined;
    if (!b) {
      rows.push({ kind: "agregada", after: r, index: i });
      return;
    }
    seen.add(r.id!);
    const cells = cols
      .filter((c) => txt(b.cells[c.key]) !== txt(r.cells[c.key]))
      .map((c) => ({ key: c.key, label: c.label, before: txt(b.cells[c.key]), after: txt(r.cells[c.key]) }));
    const spanChanged = JSON.stringify(b.cells._span ?? {}) !== JSON.stringify(r.cells._span ?? {});
    rows.push(cells.length || spanChanged ? { kind: "modificada", before: b, after: r, index: i, cells } : { kind: "igual", after: r, index: i });
  });
  before.rows.forEach((r, i) => {
    if (r.id && !seen.has(r.id)) rows.push({ kind: "eliminada", before: r, index: i });
  });
  const counts = {
    agregadas: rows.filter((r) => r.kind === "agregada").length,
    eliminadas: rows.filter((r) => r.kind === "eliminada").length,
    modificadas: rows.filter((r) => r.kind === "modificada").length,
    iguales: rows.filter((r) => r.kind === "igual").length,
  };
  return { fields, rows, counts, columns: cols };
}
