import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getAreas, getPlansForYear, resolveYear } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/StatusBadge";
import { fecha } from "@/lib/requests";

export default async function Panel() {
  await requireAdmin();
  const s = await createClient();
  const year = await resolveYear();
  const areas = await getAreas();
  const plans = year ? await getPlansForYear(year.id) : [];
  const [{ count: pendientes }, { count: docentes }, { data: assigns }] = await Promise.all([
    s.from("change_requests").select("id", { count: "exact", head: true }).eq("status", "pendiente"),
    s.from("profiles").select("id", { count: "exact", head: true }).eq("active", true),
    s.from("teacher_area_assignments").select("area_id, teacher:profiles(full_name)").eq("active", true),
  ]);
  const resp = (areaId: string) =>
    ((assigns ?? []) as unknown as { area_id: string; teacher: { full_name: string } | null }[])
      .filter((x) => x.area_id === areaId)
      .map((x) => x.teacher?.full_name)
      .filter(Boolean)
      .join(", ");
  const cards = [
    { label: "Áreas", value: areas.length },
    { label: "Docentes activos", value: docentes ?? 0 },
    { label: "Mallas publicadas", value: plans.filter((p) => p.status === "publicada").length },
    { label: "En revisión de importación", value: plans.filter((p) => ["importada", "en_revision", "pendiente_aprobacion"].includes(p.status)).length },
    { label: "Solicitudes pendientes", value: pendientes ?? 0, href: "/admin/solicitudes" },
  ];
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Panel del administrador</h1>
      <p className="mb-6 text-slate-600">Vigencia {year?.year}. (El panel completo con filtros y modificaciones recientes llega en la Etapa 4.)</p>
      <ul className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map((c) => (
          <li key={c.label} className="tarjeta text-center">
            <p className="text-3xl font-black text-institucional">{c.value}</p>
            <p className="text-sm font-semibold text-slate-600">{c.href ? <Link href={c.href} className="underline">{c.label}</Link> : c.label}</p>
          </li>
        ))}
      </ul>
      <h2 className="mb-2 text-lg font-bold">Seguimiento de las áreas</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr><th className="p-3">Área</th><th className="p-3">Vigencia</th><th className="p-3">Estado</th><th className="p-3">Última actualización</th><th className="p-3">Responsable</th></tr>
          </thead>
          <tbody>
            {areas.map((a) => {
              const p = plans.find((x) => x.area_id === a.id);
              return (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="p-3 font-semibold"><Link href={`/areas/${a.slug}`} className="hover:underline">{a.name}</Link></td>
                  <td className="p-3">{year?.year}</td>
                  <td className="p-3">{p ? <StatusBadge plan={p.status} /> : <StatusBadge plan="sin_importar" />}</td>
                  <td className="p-3">{p ? fecha(p.updated_at) : "—"}</td>
                  <td className="p-3">{resp(a.id) || <span className="text-slate-400">Sin asignar</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
