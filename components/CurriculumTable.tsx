import type { Column, RowSnap } from "@/lib/types";
import { columnGroups, layoutRows } from "@/lib/table";

/** Tabla curricular con sus columnas originales; en celular se muestra como tarjetas. */
export function CurriculumTable({ columns, rows }: { columns: Column[]; rows: RowSnap[] }) {
  const layout = layoutRows(columns, rows);
  const hasGroups = columns.some((c) => c.group);
  const groups = columnGroups(columns);
  const label = (k: string) => columns.find((c) => c.key === k)?.label ?? k;

  if (rows.length === 0) {
    return <p className="tarjeta text-slate-600">Esta malla no tiene filas registradas.</p>;
  }

  return (
    <>
      {/* Computador y tableta */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-300 bg-white md:block">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-institucional text-white">
            {hasGroups && (
              <tr>
                {groups.map((g, i) =>
                  g.label ? (
                    <th key={i} colSpan={g.span} className="border border-white/30 px-3 py-2 text-center font-bold">
                      {g.label}
                    </th>
                  ) : (
                    <th key={i} colSpan={g.span} className="border border-white/30" />
                  ),
                )}
              </tr>
            )}
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="border border-white/30 px-3 py-2 text-left align-bottom font-bold">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {layout.map((cells, ri) => (
              <tr key={rows[ri].id ?? ri} className="even:bg-slate-50">
                {cells.map((cell) =>
                  cell.kind === "cell" ? (
                    <td
                      key={cell.key}
                      rowSpan={cell.rowSpan}
                      colSpan={cell.colSpan}
                      className="texto-celda border border-slate-300 px-3 py-2 align-top"
                    >
                      {cell.text}
                    </td>
                  ) : null,
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Celular: una tarjeta por fila */}
      <ol className="space-y-3 md:hidden">
        {layout.map((cells, ri) => (
          <li key={rows[ri].id ?? ri} className="tarjeta p-4">
            <p className="mb-2 text-xs font-bold uppercase text-slate-500">Fila {ri + 1}</p>
            <dl className="space-y-3">
              {cells.map((cell) => {
                const text =
                  cell.kind === "cell"
                    ? cell.text
                    : (layout[cell.originRow].find((c) => c.kind === "cell" && c.key === cell.key) as { text: string } | undefined)?.text ?? "";
                return (
                  <div key={cell.key}>
                    <dt className="text-xs font-bold text-institucional">{label(cell.key)}</dt>
                    <dd className="texto-celda text-sm">
                      {text || <span className="text-slate-400">(vacío)</span>}
                      {cell.kind === "covered" && (
                        <span className="ml-1 text-xs text-slate-500">(igual que la fila {cell.originRow + 1})</span>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </li>
        ))}
      </ol>
    </>
  );
}
