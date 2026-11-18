"use client";
import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import type { Snapshot } from "@/lib/types";
import { addRowAfter, coverMap, deleteRow, setCell } from "@/lib/rowops";
import { CurriculumTable } from "@/components/CurriculumTable";
import type { EditorState } from "@/app/actions/propuestas";

type Props = {
  initial: Snapshot;
  projectId: string;
  requestId?: string | null;
  backTo: string;
  cancelHref: string;
  mode: "propuesta" | "importacion";
  initialSummary?: string;
  action: (s: EditorState, f: FormData) => Promise<EditorState>;
};

function AutoText(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const rows = Math.min(14, Math.max(2, String(props.value ?? "").split("\n").length + Math.ceil(String(props.value ?? "").length / 90)));
  return <textarea {...props} rows={rows} className="campo texto-celda resize-y" />;
}

export function Editor({ initial, projectId, requestId, backTo, cancelHref, mode, initialSummary, action }: Props) {
  const [snap, setSnap] = useState<Snapshot>(initial);
  const [summary, setSummary] = useState(initialSummary ?? "");
  const [preview, setPreview] = useState(false);
  const [state, formAction, pending] = useActionState(action, {});
  const cover = useMemo(() => coverMap(snap.columns, snap.rows), [snap.columns, snap.rows]);
  const dirty = JSON.stringify(snap) !== JSON.stringify(initial) || summary !== (initialSummary ?? "");

  const update = (p: Partial<Snapshot>) => setSnap((s) => ({ ...s, ...p }));

  return (
    <form action={formAction} className="pb-28">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="requestId" value={requestId ?? ""} />
      <input type="hidden" name="backTo" value={backTo} />
      <input type="hidden" name="snapshot" value={JSON.stringify(snap)} />

      <section className="tarjeta mb-6 space-y-4">
        <div>
          <label className="etiqueta" htmlFor="nombre">
            Nombre del {snap.label.toLowerCase()} {snap.number_text}
          </label>
          <input id="nombre" className="campo" value={snap.name} onChange={(e) => update({ name: e.target.value })} />
        </div>
        <div>
          <label className="etiqueta" htmlFor="proposito">
            {snap.purpose_label}
          </label>
          <AutoText id="proposito" value={snap.purpose} onChange={(e) => update({ purpose: e.target.value })} />
        </div>
        {snap.header_fields.map((f, i) => (
          <div key={i}>
            <label className="etiqueta" htmlFor={`hf${i}`}>
              {f.label || "Texto del encabezado"}
            </label>
            <AutoText
              id={`hf${i}`}
              value={f.value}
              onChange={(e) =>
                update({ header_fields: snap.header_fields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })
              }
            />
          </div>
        ))}
      </section>

      <h2 className="mb-2 text-lg font-bold">Filas de la tabla</h2>
      <p className="mb-4 text-sm text-slate-600">
        Cada tarjeta es una fila. Las columnas son las del documento original y no se pueden cambiar desde aquí.
      </p>

      <ol className="space-y-4">
        {snap.rows.map((row, ri) => (
          <li key={row.id ?? `n${ri}`} className="tarjeta">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-institucional">
                Fila {ri + 1} {!row.id && <span className="ml-1 rounded bg-green-100 px-2 text-xs text-green-800">nueva</span>}
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className="btn-secundario min-h-9 text-sm"
                  onClick={() => update({ rows: addRowAfter(snap.columns, snap.rows, ri) })}
                >
                  ＋ Agregar fila debajo
                </button>
                <button
                  type="button"
                  className="btn-secundario min-h-9 text-sm text-red-700"
                  disabled={snap.rows.length <= 1}
                  onClick={() => {
                    if (confirm(`¿Eliminar la fila ${ri + 1}? Podrá cancelar la edición si se equivoca.`))
                      update({ rows: deleteRow(snap.columns, snap.rows, ri) });
                  }}
                >
                  🗑 Eliminar fila
                </button>
              </span>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {snap.columns.map((col, ci) => {
                const origin = cover[ri]?.[ci];
                const inColspan = Object.entries(row.cells._colspan ?? {}).some(([k, n]) => {
                  const start = snap.columns.findIndex((c) => c.key === k);
                  return start >= 0 && ci > start && ci < start + Number(n);
                });
                if (inColspan) return null;
                return (
                  <div key={col.key}>
                    <label className="etiqueta" htmlFor={`c${ri}${col.key}`}>
                      {col.label}
                    </label>
                    {origin !== null && origin !== undefined ? (
                      <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
                        Celda combinada: se edita en la fila {origin + 1}.
                      </p>
                    ) : (
                      <AutoText
                        id={`c${ri}${col.key}`}
                        value={String(row.cells[col.key] ?? "")}
                        onChange={(e) => update({ rows: setCell(snap.rows, ri, col.key, e.target.value) })}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ol>

      {mode === "propuesta" && (
        <section className="tarjeta mt-6">
          <label className="etiqueta" htmlFor="resumen">
            Explique brevemente qué cambió y por qué (lo verá el administrador)
          </label>
          <AutoText id="resumen" name="summary" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </section>
      )}

      {preview && (
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-bold">Vista previa</h2>
          <CurriculumTable columns={snap.columns} rows={snap.rows} />
        </section>
      )}

      {state.error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 font-semibold text-red-800">
          {state.error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-linea bg-white/95 p-3 shadow-lg backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
          {mode === "propuesta" ? (
            <>
              <button name="accion" value="enviar" className="btn-primario" disabled={pending || (!dirty && !requestId)}>
                💾 Guardar cambios y enviar a aprobación
              </button>
              <button name="accion" value="borrador" className="btn-secundario" disabled={pending || (!dirty && !requestId)}>
                Guardar como borrador
              </button>
            </>
          ) : (
            <button className="btn-primario" disabled={pending || !dirty}>
              💾 Guardar corrección
            </button>
          )}
          <button type="button" className="btn-secundario" onClick={() => setPreview((v) => !v)}>
            👁 {preview ? "Ocultar vista previa" : "Vista previa"}
          </button>
          <Link
            href={cancelHref}
            className="btn-secundario"
            onClick={(e) => {
              if (dirty && !confirm("¿Salir sin guardar? Se perderán los cambios.")) e.preventDefault();
            }}
          >
            Cancelar
          </Link>
          {pending && <span className="text-sm text-slate-600">Guardando…</span>}
          {mode === "propuesta" && (
            <span className="ml-auto hidden text-xs text-slate-500 md:block">
              La malla publicada no cambia hasta que el administrador apruebe.
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
