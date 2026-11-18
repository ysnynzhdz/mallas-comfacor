import type { Snapshot } from "@/lib/types";
import { diffSnapshots } from "@/lib/diff";

function Cambio({ before, after, l }: { before: string; after: string; l: { before: string; after: string } }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
        <p className="mb-1 text-xs font-bold text-red-800">{l.before}</p>
        <p className="texto-celda text-sm">{before || <span className="text-slate-400">(vacío)</span>}</p>
      </div>
      <div className="rounded-lg border border-green-200 bg-green-50 p-3">
        <p className="mb-1 text-xs font-bold text-green-800">{l.after}</p>
        <p className="texto-celda text-sm">{after || <span className="text-slate-400">(vacío)</span>}</p>
      </div>
    </div>
  );
}

/** Muestra lo anterior y lo propuesto, con colores: verde agregado, rojo eliminado, amarillo modificado. */
export function DiffView({
  before,
  after,
  beforeLabel = "ANTES",
  afterLabel = "PROPUESTO",
}: {
  before: Snapshot;
  after: Snapshot;
  beforeLabel?: string;
  afterLabel?: string;
}) {
  const l = { before: beforeLabel, after: afterLabel };
  const d = diffSnapshots(before, after);
  const label = (k: string) => d.columns.find((c) => c.key === k)?.label ?? k;
  const nothing = d.fields.length === 0 && d.counts.agregadas + d.counts.eliminadas + d.counts.modificadas === 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm font-semibold">
        <span className="rounded-full bg-green-100 px-3 py-1 text-green-800">{d.counts.agregadas} fila(s) nueva(s)</span>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">{d.counts.modificadas} modificada(s)</span>
        <span className="rounded-full bg-red-100 px-3 py-1 text-red-800">{d.counts.eliminadas} eliminada(s)</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{d.counts.iguales} sin cambios</span>
        {d.fields.length > 0 && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">{d.fields.length} cambio(s) en el encabezado</span>
        )}
      </div>
      {nothing && <p className="tarjeta">No hay diferencias con la versión publicada.</p>}
      {d.fields.map((f, i) => (
        <section key={i} className="tarjeta border-l-8 border-l-amber-400">
          <h3 className="mb-2 font-bold">{f.label}</h3>
          <Cambio before={f.before} after={f.after} l={l} />
        </section>
      ))}
      {d.rows
        .filter((r) => r.kind !== "igual")
        .map((r, i) => (
          <section
            key={i}
            className={`tarjeta border-l-8 ${
              r.kind === "agregada" ? "border-l-green-500" : r.kind === "eliminada" ? "border-l-red-500" : "border-l-amber-400"
            }`}
          >
            <h3 className="mb-2 font-bold">
              {r.kind === "agregada" && `Fila nueva (posición ${r.index + 1})`}
              {r.kind === "eliminada" && `Fila eliminada (era la fila ${r.index + 1})`}
              {r.kind === "modificada" && `Fila ${r.index + 1} modificada`}
            </h3>
            {r.kind === "modificada" &&
              (r.cells.length ? (
                r.cells.map((c) => (
                  <div key={c.key} className="mb-3">
                    <p className="mb-1 text-sm font-bold text-institucional">{c.label}</p>
                    <Cambio before={c.before} after={c.after} l={l} />
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-600">Cambió la combinación de celdas de esta fila.</p>
              ))}
            {(r.kind === "agregada" || r.kind === "eliminada") && (
              <dl className="grid gap-2 md:grid-cols-2">
                {Object.entries((r.kind === "agregada" ? r.after : r.before).cells)
                  .filter(([k, v]) => !k.startsWith("_") && typeof v === "string")
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs font-bold text-institucional">{label(k)}</dt>
                      <dd className="texto-celda text-sm">{(v as string) || <span className="text-slate-400">(vacío)</span>}</dd>
                    </div>
                  ))}
              </dl>
            )}
          </section>
        ))}
    </div>
  );
}
