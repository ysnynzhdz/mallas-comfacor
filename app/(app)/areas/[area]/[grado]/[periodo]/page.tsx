import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CurriculumTable } from "@/components/CurriculumTable";
import { ProjectHeader } from "@/components/ProjectHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { requireUser, editableAreaIds } from "@/lib/auth";
import { getRows, toSnapshot } from "@/lib/data";
import { resolveProject } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";

export default async function PeriodoPage({
  params,
  searchParams,
}: {
  params: Promise<{ area: string; grado: string; periodo: string }>;
  searchParams: Promise<{ vigencia?: string; asignatura?: string; guardado?: string }>;
}) {
  const { profile } = await requireUser();
  const { area: a, grado, periodo } = await params;
  const sp = await searchParams;
  const { area, year, plan, grade, period, project, subject, tabs, vqp: vq } = await resolveProject(a, grado, periodo, sp.vigencia, sp.asignatura);
  const base = `/areas/${area.slug}/${grade.slug}`;
  const crumbs = [
    { href: "/inicio", label: "Inicio" },
    { href: `/areas/${area.slug}${vq}`, label: area.name },
    { href: `${base}${vq}`, label: grade.name },
    { label: period.name },
  ];

  if (!project || !plan) {
    return (
      <div>
        <Breadcrumbs items={crumbs} />
        <p className="tarjeta">No existe una malla registrada para {area.name}, {grade.name}, {period.name} ({year.year}).</p>
      </div>
    );
  }

  const rows = await getRows(project.id);
  const snap = toSnapshot(project, rows);
  const editable = await editableAreaIds(profile);
  const published = plan.status === "publicada" || plan.status === "requiere_actualizacion";
  const canPropose = published && year.status !== "archivada" && (editable === "all" || editable.has(area.id));
  const canFixImport = !published && profile.role === "admin";

  const supabase = await createClient();
  const { data: mine } = await supabase
    .from("change_requests")
    .select("id, status, created_at")
    .eq("project_id", project.id)
    .eq("requested_by", profile.id)
    .in("status", ["borrador", "pendiente", "rechazado"])
    .order("created_at", { ascending: false })
    .limit(1);
  const open = mine?.[0];

  return (
    <div>
      <Breadcrumbs items={crumbs} />
      {sp.guardado && (
        <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 font-semibold text-green-800">
          {sp.guardado === "enviado"
            ? "Su propuesta fue enviada al administrador. La malla publicada no cambia hasta que sea aprobada."
            : sp.guardado === "borrador"
              ? "Su propuesta quedó guardada como borrador. Puede enviarla cuando esté lista."
              : "Cambios guardados."}
        </p>
      )}
      {!published && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          Vista previa para el administrador: esta malla aún no está publicada (<StatusBadge plan={plan.status} />). Los docentes no la ven.
        </p>
      )}
      {tabs.length > 1 && (
        <nav aria-label="Asignaturas" className="mb-4 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={`${base}/${period.number}${t.query}`}
              aria-current={t.active ? "page" : undefined}
              className={t.active ? "btn-institucional" : "btn-secundario"}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}
      {project.name_is_proposed && (
        <p className="mb-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
          ℹ️ El nombre de esta unidad fue <strong>propuesto</strong> a partir de su contenido durante la revisión, porque el documento original
          no traía nombre o traía uno genérico. Puede cambiarse con una solicitud.
        </p>
      )}
      <ProjectHeader
        snap={snap}
        subject={subject?.name}
        area={area.name}
        areaColor={area.color}
        grade={grade.name}
        period={period.number}
        year={year.year}
        version={project.version_no || undefined}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {canPropose && (
          <Link href={`${base}/${period.number}/editar${vq}`} className="btn-primario">
            ✏️ {open ? "Continuar mi propuesta" : "Proponer cambios"}
          </Link>
        )}
        {canFixImport && (
          <Link href={`${base}/${period.number}/editar${vq}`} className="btn-institucional">
            ✏️ Corregir importación
          </Link>
        )}
        {(editable === "all" || editable.has(area.id)) && published && (
          <Link href={`${base}/${period.number}/historial${vq}`} className="btn-secundario">
            🕘 Historial de cambios
          </Link>
        )}
        <Link href={`${base}${vq}`} className="btn-secundario">
          ← Volver a los períodos
        </Link>
      </div>
      {open && (
        <p className="mb-4 rounded-lg bg-blue-50 p-3 text-sm">
          Tiene una propuesta para esta malla en estado <StatusBadge request={open.status} />.{" "}
          <Link href="/mis-solicitudes" className="font-semibold text-institucional underline">
            Ver mis solicitudes
          </Link>
        </p>
      )}
      <CurriculumTable columns={snap.columns} rows={snap.rows} />
    </div>
  );
}
