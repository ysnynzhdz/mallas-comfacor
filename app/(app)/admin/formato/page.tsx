import { ActionForm } from "@/components/ActionForm";
import { requireAdmin } from "@/lib/auth";
import { guardarFormatoEstudiantes } from "@/app/actions/admin";
import { createClient } from "@/lib/supabase/server";
import type { StudentSheet } from "@/lib/export/types";

const CAMPOS: [keyof StudentSheet, string, string][] = [
  ["titulo", "Nombre de la institución", "Primera línea, en negrilla"],
  ["lema_anio", "Lema del año", "Cámbielo cada año escolar"],
  ["lema", "Lema institucional", ""],
  ["subtitulo", "Subtítulo", ""],
  ["documento", "Nombre del documento", ""],
  ["ciudad", "Ciudad (para la fecha)", ""],
  ["nota", "Nota al final", "Se imprime debajo de la tabla, en cursiva"],
];

export default async function Formato() {
  await requireAdmin();
  const s = await createClient();
  const { data } = await s.from("institution_settings").select("student_sheet").maybeSingle();
  const sheet = (data?.student_sheet ?? {}) as StudentSheet;
  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-semibold text-tinta">Formato de la malla para estudiantes</h1>
      <p className="mb-6 text-slate-600">
        Estos textos aparecen en el encabezado del Word que se descarga con el botón «Malla para estudiantes», sobre el membrete del
        colegio. El contenido de cada malla no se cambia aquí.
      </p>
      <ActionForm action={guardarFormatoEstudiantes} className="tarjeta space-y-4">
        {CAMPOS.map(([k, label, help]) => (
          <div key={k}>
            <label className="etiqueta" htmlFor={k}>{label}</label>
            {k === "nota" || k === "lema_anio" ? (
              <textarea id={k} name={k} rows={k === "nota" ? 3 : 2} defaultValue={sheet[k] ?? ""} className="campo" />
            ) : (
              <input id={k} name={k} defaultValue={sheet[k] ?? ""} className="campo" />
            )}
            {help && <p className="mt-1 text-xs text-slate-500">{help}</p>}
          </div>
        ))}
        <button className="btn-primario">Guardar formato</button>
      </ActionForm>
    </div>
  );
}
