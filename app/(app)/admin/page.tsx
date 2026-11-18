import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getAreas, getPlansForYear, getYears, resolveYear } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/StatusBadge";
import { fecha } from "@/lib/requests";
import { PLAN_STATUS_LABEL, type PlanStatus } from "@/lib/types";

const ACCION: Record<string, string> = {
  malla_publicada: "publicó una malla",
  importacion_cargada: "cargó una importación",
  importacion_reemplazada: "reemplazó un borrador importado",
  correccion_importacion: "corrigió una importación",
  solicitud_enviada: "envió una solicitud de cambio",
  solicitud_aprobada: "aprobó una solicitud",
  solicitud_rechazada: "rechazó una solicitud",
  version_restaurada: "restauró una versión",
  vigencia_duplicada: "preparó una nueva vigencia",
  vigencia_activada: "activó una vigencia",
  cuenta_creada: "se registró en la plataforma",
};

export default async function Panel({ searchParams }: { searchParams: Promise<{ vigencia?: string; estado?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const s = await createClient();
  const [year, years, areas] = await Promise.all([resolveYear(sp.vigencia), getYears(), getAreas()]);
  const plans = year ? await getPlansForYear(year.id) : [];
  const planIds = plans.length ? plans.map((p) => p.id) : ["00000000-0000-0000-0000-000000000000"];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [
    { data: reqs },
    { count: docentes },
    { count: inactivos },
    { data: assigns },
    { data: projs },
    { data: logs },
  ] = await Promise.all([
    s.from("change_requests").select("status, decided_at, project:projects!inner(plan_id)").in("projects.plan_id", planIds),
    s.from("profiles").select("id", { count: "exact", head: true }).eq("active", true),
    s.from("profiles").select("id", { count: "exact", head: true }).eq("active", false),
    s.from("teacher_area_assignments").select("area_id, teacher:profiles(full_name)").eq("active", true),
    s.from("projects").select("plan_id, updated_at").in("plan_id", planIds),
    s.from("audit_logs").select("id, actor_id, action, entity, details, created_at").not("action", "in", "(insert,update,delete)").order("created_at", { ascending: false }).limit(15),
  ]);
  const actorIds = [...new Set((logs ?? []).map((l) => l.actor_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length ? await s.from("profiles").select("id, full_name, email").in("id", actorIds) : { data: [] };
  const who = (id: string | null) => {
    const a = (actors ?? []).find((x) => x.id === id);
    return a ? a.full_name || a.email : "El sistema";
  };
  const requests = (reqs ?? []) as unknown as { status: string; decided_at: string | null; project: { plan_id: string } }[];
  const resp = (areaId: string) =>
    ((assigns ?? []) as unknown as { area_id: string; teacher: { full_name: string } | null }[])
      .filter((x) => x.area_id === areaId)
      .map((x) => x.teacher?.full_name)
      .filter(Boolean)
      .join(", ");
  const units = (planId?: string) => (projs ?? []).filter((p) => p.plan_id === planId).length;
  const lastChange = (planId?: string, fallback?: string) =>
    (projs ?? []).filter((p) => p.plan_id === planId).reduce((m, p) => (p.updated_at > m ? p.updated_at : m), fallback ?? "");
  const pendientesDe = (planId?: string) => requests.filter((r) => r.project.plan_id === planId && r.status === "pendiente").length;

  const pendientes = requests.filter((r) => r.status === "pendiente").length;
  const aprobadasMes = requests.filter((r) => r.status === "aprobado" && (r.decided_at ?? "") >= monthStart).length;
  const sinResp = areas.filter((a) => !resp(a.id));
  const estado = sp.estado as PlanStatus | "sin_importar" | undefined;
  const filtered = areas.filter((a) => {
    if (!estado) return true;
    const p = plans.find((x) => x.area_id === a.id);
    return (p?.status ?? "sin_importar") === estado;
  });
  const q = (extra: Record<string, string>) => `?${new URLSearchParams({ ...(sp.vigencia ? { vigencia: sp.vigencia } : {}), ...extra })}`;

  const cards = [
    { label: "Áreas", value: areas.length },
    { label: "Mallas publicadas", value: plans.filter((p) => p.status === "publicada").length },
    { label: "Unidades registradas", value: (projs ?? []).length },
    { label: "Docentes activos", value: docentes ?? 0, href: "/admin/docentes" },
    { label: "Solicitudes pendientes", value: pendientes, href: "/admin/solicitudes" },
    { label: "Aprobadas este mes", value: aprobadasMes },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Panel del administrador</h1>
          <p className="text-slate-600">Vigencia {year?.year}.</p>
        </div>
        <form className="flex items-end gap-2">
          <div>
            <label className="etiqueta" htmlFor="vigencia">Vigencia</label>
            <select id="vigencia" name="vigencia" defaultValue={String(year?.year ?? "")} className="campo">
              {years.map((y) => <option key={y.id} value={y.year}>{y.year}</option>)}
            </select>
          </div>
          <button className="btn-secundario">Ver</button>
        </form>
      </div>

      <ul className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <li key={c.label} className="tarjeta text-center">
            <p className="text-3xl font-semibold text-institucional">{c.value}</p>
            <p className="text-sm font-semibold text-slate-600">{c.href ? <Link href={c.href} className="underline">{c.label}</Link> : c.label}</p>
          </li>
        ))}
      </ul>

      {(pendientes > 0 || (inactivos ?? 0) > 0 || sinResp.length > 0) && (
        <section className="mb-6 space-y-2">
          <h2 className="text-lg font-bold">Requiere su atención</h2>
          {pendientes > 0 && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Hay <strong>{pendientes}</strong> solicitud(es) de cambio esperando su decisión.{" "}
              <Link href="/admin/solicitudes" className="font-semibold underline">Revisarlas</Link>
            </p>
          )}
          {(inactivos ?? 0) > 0 && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <strong>{inactivos}</strong> cuenta(s) nueva(s) esperan activación.{" "}
              <Link href="/admin/docentes" className="font-semibold underline">Ir a Docentes</Link>
            </p>
          )}
          {sinResp.length > 0 && (
            <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
              Áreas sin docente responsable ({sinResp.length}): {sinResp.map((a) => a.name).join(", ")}.{" "}
              <Link href="/admin/docentes" className="font-semibold underline">Asignar</Link>
            </p>
          )}
        </section>
      )}

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Seguimiento de las áreas</h2>
        <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-1 text-sm">
          <Link href={q({})} className={!estado ? "btn-institucional" : "btn-secundario"}>Todas</Link>
          {(["publicada", "en_revision", "importada", "requiere_actualizacion", "sin_importar"] as const).map((st) => (
            <Link key={st} href={q({ estado: st })} className={estado === st ? "btn-institucional" : "btn-secundario"}>
              {PLAN_STATUS_LABEL[st]}
            </Link>
          ))}
        </nav>
      </div>
      <div className="mb-8 overflow-x-auto rounded-lg border border-linea bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-3">Área</th><th className="p-3">Estado</th><th className="p-3">Unidades</th>
              <th className="p-3">Solicitudes pendientes</th><th className="p-3">Última actualización</th><th className="p-3">Responsable</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const p = plans.find((x) => x.area_id === a.id);
              const pend = pendientesDe(p?.id);
              return (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="p-3 font-semibold"><Link href={`/areas/${a.slug}${sp.vigencia ? `?vigencia=${sp.vigencia}` : ""}`} className="hover:underline">{a.name}</Link></td>
                  <td className="p-3">{p ? <StatusBadge plan={p.status} /> : <StatusBadge plan="sin_importar" />}</td>
                  <td className="p-3">{units(p?.id)}</td>
                  <td className="p-3">{pend ? <Link href="/admin/solicitudes" className="font-bold text-amber-700 underline">{pend}</Link> : "0"}</td>
                  <td className="p-3">{p ? fecha(lastChange(p.id, p.updated_at)) : "—"}</td>
                  <td className="p-3">{resp(a.id) || <span className="text-slate-400">Sin asignar</span>}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="p-3 text-slate-500">Ninguna área en este estado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-lg font-bold">Actividad reciente</h2>
      <ul className="tarjeta divide-y divide-slate-100">
        {(logs ?? []).map((l) => (
          <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
            <span>
              <strong>{who(l.actor_id)}</strong> {ACCION[l.action] ?? l.action.replaceAll("_", " ")}
              {l.details?.archivo ? ` · ${l.details.archivo}` : ""}
              {l.details?.vigencia ? ` · ${l.details.vigencia}` : ""}
            </span>
            <span className="text-slate-500">{fecha(l.created_at)}</span>
          </li>
        ))}
        {(logs ?? []).length === 0 && <li className="py-2 text-sm text-slate-500">Sin actividad registrada.</li>}
      </ul>
    </div>
  );
}
