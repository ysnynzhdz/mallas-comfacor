import { ActionForm } from "@/components/ActionForm";
import { requireAdmin } from "@/lib/auth";
import { cargarImportacion } from "@/app/actions/admin";
import { getAreas } from "@/lib/data";
import { IMPORTACIONES } from "@/lib/importaciones";
import { createClient } from "@/lib/supabase/server";

export default async function Cargar() {
  await requireAdmin();
  const areas = await getAreas();
  const s = await createClient();
  const { data: plans } = await s.from("curriculum_plans").select("area_id, status, year:academic_years(year)").is("subject_id", null);
  const estado = (slug: string) => {
    const a = areas.find((x) => x.slug === slug);
    const p = (plans ?? []).find((x) => x.area_id === a?.id && (x.year as unknown as { year: number })?.year === 2024);
    return p ? (p.status === "importada" ? "ya cargada como borrador" : "ya publicada") : "pendiente";
  };
  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold">Cargar una importación</h1>
      <p className="mb-6 text-slate-600">
        Los documentos Word se leen con el importador (sin modificarlos). Aquí se carga el resultado, ya con las correcciones de ortografía y
        estructura, como <strong>borrador</strong>: nada se publica hasta que usted lo revise y lo apruebe.
      </p>
      <ActionForm action={cargarImportacion} className="tarjeta space-y-4">
        <label className="etiqueta" htmlFor="archivo">Importación disponible</label>
        <select id="archivo" name="archivo" className="campo">
          {IMPORTACIONES.map((k) => {
            const a = areas.find((x) => x.slug === k.area);
            return (
              <option key={k.id} value={k.id}>
                {a?.name ?? k.area} · vigencia {k.year} · «{k.file}» · {estado(k.area)}
              </option>
            );
          })}
        </select>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="reemplazar" value="1" className="mt-1 size-5" />
          <span>
            Si esta área ya está cargada como <strong>borrador</strong> (sin publicar, sin solicitudes y sin correcciones manuales), reemplazarla
            por esta versión corregida. Una malla publicada nunca se reemplaza.
          </span>
        </label>
        <button className="btn-primario">Cargar como borrador para revisión</button>
      </ActionForm>
    </div>
  );
}
