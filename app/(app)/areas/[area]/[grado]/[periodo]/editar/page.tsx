import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Editor } from "@/components/Editor";
import { requireUser, editableAreaIds } from "@/lib/auth";
import { getRows, toSnapshot } from "@/lib/data";
import { resolveProject } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { guardarCorreccionImportacion, guardarPropuesta } from "@/app/actions/propuestas";
import type { Snapshot } from "@/lib/types";

export default async function EditarPage({
  params,
  searchParams,
}: {
  params: Promise<{ area: string; grado: string; periodo: string }>;
  searchParams: Promise<{ vigencia?: string }>;
}) {
  const { profile } = await requireUser();
  const { area: a, grado, periodo } = await params;
  const { vigencia } = await searchParams;
  const { area, year, plan, grade, period, project, vq } = await resolveProject(a, grado, periodo, vigencia);
  if (!project || !plan) notFound();
  const viewHref = `/areas/${area.slug}/${grade.slug}/${period.number}${vq}`;
  const published = plan.status === "publicada" || plan.status === "requiere_actualizacion";
  const editable = await editableAreaIds(profile);
  const canEdit = editable === "all" || editable.has(area.id);

  const crumbs = [
    { href: "/inicio", label: "Inicio" },
    { href: `/areas/${area.slug}${vq}`, label: area.name },
    { href: `/areas/${area.slug}/${grade.slug}${vq}`, label: grade.name },
    { href: viewHref, label: period.name },
    { label: published ? "Proponer cambios" : "Corregir importación" },
  ];

  if (!published) {
    if (profile.role !== "admin") redirect(viewHref);
    const snap = toSnapshot(project, await getRows(project.id));
    return (
      <div>
        <Breadcrumbs items={crumbs} />
        <h1 className="mb-1 text-2xl font-bold">Corregir importación · {area.name} · {grade.name} · {period.name}</h1>
        <p className="mb-6 text-slate-600">
          La malla aún no está publicada. Corrija solo errores de importación; no cambie la redacción original.
        </p>
        <Editor
          initial={snap}
          projectId={project.id}
          backTo={viewHref}
          cancelHref={viewHref}
          mode="importacion"
          action={guardarCorreccionImportacion}
        />
      </div>
    );
  }

  if (!canEdit || year.status === "archivada") {
    return (
      <div>
        <Breadcrumbs items={crumbs} />
        <p className="tarjeta">
          No tiene permiso para editar esta área. Puede consultarla y descargarla.{" "}
          <Link href={viewHref} className="font-semibold text-institucional underline">
            Volver
          </Link>
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: reqs } = await supabase
    .from("change_requests")
    .select("id, status, proposed, summary, reviewer_notes")
    .eq("project_id", project.id)
    .eq("requested_by", profile.id)
    .in("status", ["borrador", "pendiente", "rechazado"])
    .order("created_at", { ascending: false })
    .limit(1);
  const open = reqs?.[0];

  if (open?.status === "pendiente") {
    return (
      <div>
        <Breadcrumbs items={crumbs} />
        <p className="tarjeta">
          Ya tiene una propuesta pendiente de aprobación para esta malla. Espere la decisión del administrador antes de
          proponer otra.{" "}
          <Link href="/mis-solicitudes" className="font-semibold text-institucional underline">
            Ver mis solicitudes
          </Link>
        </p>
      </div>
    );
  }

  const current = toSnapshot(project, await getRows(project.id));
  const initial: Snapshot = open ? { ...(open.proposed as Snapshot), columns: current.columns } : current;

  return (
    <div>
      <Breadcrumbs items={crumbs} />
      <h1 className="mb-1 text-2xl font-bold">
        Proponer cambios · {area.name} · {grade.name} · {period.name}
      </h1>
      <p className="mb-4 text-slate-600">
        Sus cambios se guardan como propuesta. La versión publicada no cambia hasta que el administrador la apruebe.
      </p>
      {open?.status === "rechazado" && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-900">
          <strong>Su propuesta anterior fue rechazada.</strong> Motivo: {open.reviewer_notes}. Puede corregirla y enviarla de
          nuevo.
        </p>
      )}
      {open?.status === "borrador" && (
        <p className="mb-4 rounded-lg bg-blue-50 p-3 text-sm">Está continuando un borrador que guardó antes.</p>
      )}
      <Editor
        initial={initial}
        projectId={project.id}
        requestId={open?.id}
        backTo={viewHref}
        cancelHref={viewHref}
        mode="propuesta"
        initialSummary={open?.summary ?? ""}
        action={guardarPropuesta}
      />
    </div>
  );
}
