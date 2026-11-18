import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { requireAdmin } from "@/lib/auth";
import { activarVigencia, duplicarVigencia } from "@/app/actions/admin";
import { getYears } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

const ESTADO: Record<string, string> = { vigente: "Vigente", borrador: "En preparación", archivada: "Archivada" };

export default async function Vigencias() {
  await requireAdmin();
  const years = await getYears();
  const s = await createClient();
  const { data: plans } = await s.from("curriculum_plans").select("academic_year_id, status");
  const count = (id: string, pub: boolean) =>
    (plans ?? []).filter((p) => p.academic_year_id === id && (["publicada", "requiere_actualizacion"].includes(p.status) === pub)).length;
  const vigente = years.find((y) => y.status === "vigente");
  const sugerida = Math.max(...years.map((y) => y.year), new Date().getFullYear()) + (years.some((y) => y.year === new Date().getFullYear()) ? 1 : 0);

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold">Vigencias</h1>
      <p className="mb-6 text-slate-600">
        Cada año escolar es una vigencia. Para preparar un año nuevo se copia la vigencia anterior como borrador; las mallas copiadas se
        revisan y se publican, y al final se activa la nueva vigencia. La vigencia anterior queda archivada y se puede consultar y comparar.
      </p>
      <div className="mb-6 overflow-x-auto rounded-lg border border-linea bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr><th className="p-3">Vigencia</th><th className="p-3">Estado</th><th className="p-3">Mallas publicadas</th><th className="p-3">En revisión</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.id} className="border-t border-slate-100">
                <td className="p-3 font-bold">{y.year}</td>
                <td className="p-3">{ESTADO[y.status] ?? y.status}</td>
                <td className="p-3">{count(y.id, true)}</td>
                <td className="p-3">{count(y.id, false)}</td>
                <td className="p-3"><Link href={`/inicio?vigencia=${y.year}`} className="font-semibold text-institucional underline">Ver</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="tarjeta mb-6">
        <h2 className="mb-2 text-lg font-bold">1. Preparar una nueva vigencia</h2>
        <p className="mb-3 text-sm text-slate-600">
          Se copian solo las mallas <strong>publicadas</strong>. Las copias quedan en revisión (los docentes no las ven) y no cambian la vigencia actual.
        </p>
        <ActionForm action={duplicarVigencia} className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="etiqueta" htmlFor="desde">Copiar desde</label>
            <select id="desde" name="desde" className="campo" defaultValue={vigente?.year}>
              {years.map((y) => <option key={y.id} value={y.year}>{y.year}</option>)}
            </select>
          </div>
          <div>
            <label className="etiqueta" htmlFor="hasta">Nueva vigencia</label>
            <input id="hasta" name="hasta" type="number" min={2000} max={2100} defaultValue={sugerida} className="campo" />
          </div>
          <div className="flex items-end"><button className="btn-primario w-full">Copiar como borrador</button></div>
        </ActionForm>
      </section>

      <section className="tarjeta">
        <h2 className="mb-2 text-lg font-bold">2. Activar una vigencia</h2>
        <p className="mb-3 text-sm text-slate-600">
          Úselo cuando todas las mallas de la nueva vigencia estén publicadas. La plataforma mostrará esa vigencia por defecto y la anterior quedará archivada (solo consulta).
        </p>
        <ActionForm action={activarVigencia} className="space-y-3">
          <select name="year" className="campo max-w-xs" defaultValue="">
            <option value="" disabled>Elija la vigencia</option>
            {years.filter((y) => y.status !== "vigente").map((y) => <option key={y.id} value={y.year}>{y.year}</option>)}
          </select>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirmo" value="1" className="mt-1 size-5" />
            <span>Confirmo que quiero cambiar la vigencia actual ({vigente?.year ?? "ninguna"}).</span>
          </label>
          <button className="btn-institucional">Activar vigencia</button>
        </ActionForm>
      </section>
    </div>
  );
}
