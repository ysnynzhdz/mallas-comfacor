import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DiffView } from "@/components/DiffView";
import { requireUser } from "@/lib/auth";
import { resolveProject } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { fecha } from "@/lib/requests";
import { restaurarVersion } from "@/app/actions/admin";
import type { Snapshot } from "@/lib/types";

const MOTIVO: Record<string, string> = { importacion: "Importación del documento original", aprobacion: "Solicitud aprobada", restauracion: "Restauración", duplicacion: "Copia de otra vigencia" };

export default async function Historial({
  params,
  searchParams,
}: {
  params: Promise<{ area: string; grado: string; periodo: string }>;
  searchParams: Promise<{ vigencia?: string; restaurada?: string; error?: string }>;
}) {
  const { profile } = await requireUser();
  const { area: a, grado, periodo } = await params;
  const sp = await searchParams;
  const { area, grade, period, project, vq } = await resolveProject(a, grado, periodo, sp.vigencia);
  if (!project) notFound();
  const s = await createClient();
  const { data } = await s
    .from("curriculum_versions")
    .select("id, version_no, snapshot, reason, created_at, author:profiles!curriculum_versions_created_by_fkey(full_name), request:change_requests(summary, requester:profiles!change_requests_requested_by_fkey(full_name))")
    .eq("project_id", project.id)
    .order("version_no", { ascending: false });
  const versions = (data ?? []) as unknown as {
    id: string; version_no: number; snapshot: Snapshot; reason: string; created_at: string;
    author: { full_name: string } | null; request: { summary: string; requester: { full_name: string } | null } | null;
  }[];
  const here = `/areas/${area.slug}/${grade.slug}/${period.number}/historial${vq}`;
  return (
    <div>
      <Breadcrumbs items={[
        { href: "/inicio", label: "Inicio" },
        { href: `/areas/${area.slug}${vq}`, label: area.name },
        { href: `/areas/${area.slug}/${grade.slug}${vq}`, label: grade.name },
        { href: `/areas/${area.slug}/${grade.slug}/${period.number}${vq}`, label: period.name },
        { label: "Historial" },
      ]} />
      <h1 className="mb-4 text-2xl font-bold">Historial · {area.name} · {grade.name} · {period.name}</h1>
      {sp.restaurada && <p className="mb-4 rounded-lg bg-green-50 p-3 font-semibold text-green-800">Versión restaurada: se creó una versión nueva y no se borró ningún registro.</p>}
      {sp.error && <p className="mb-4 rounded-lg bg-red-50 p-3 font-semibold text-red-800">{sp.error}</p>}
      {versions.length === 0 ? (
        <p className="tarjeta">No tiene permiso para ver este historial o todavía no hay versiones.</p>
      ) : (
        <ol className="space-y-4">
          {versions.map((v, i) => {
            const prev = versions[i + 1];
            return (
              <li key={v.id} className="tarjeta">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-bold">
                    Versión {v.version_no} {v.version_no === project.version_no && <span className="ml-2 rounded-full bg-green-100 px-2 text-xs text-green-800">vigente</span>}
                  </h2>
                  <span className="text-sm text-slate-600">{fecha(v.created_at)}</span>
                </div>
                <p className="text-sm text-slate-700">
                  {MOTIVO[v.reason] ?? v.reason}
                  {v.request?.requester && ` · propuesta de ${v.request.requester.full_name}`}
                  {v.author && ` · ${v.reason === "aprobacion" ? "aprobada" : "registrada"} por ${v.author.full_name}`}
                </p>
                {v.request?.summary && <p className="texto-celda mt-1 text-sm">“{v.request.summary}”</p>}
                {prev && (
                  <details className="mt-3">
                    <summary className="cursor-pointer font-semibold text-institucional">Ver cambios frente a la versión {prev.version_no}</summary>
                    <div className="mt-3"><DiffView before={prev.snapshot} after={v.snapshot} /></div>
                  </details>
                )}
                {profile.role === "admin" && v.version_no !== project.version_no && (
                  <form action={restaurarVersion} className="mt-3">
                    <input type="hidden" name="versionId" value={v.id} />
                    <input type="hidden" name="backTo" value={here} />
                    <button className="btn-secundario min-h-9 text-sm">↺ Restaurar esta versión</button>
                  </form>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
