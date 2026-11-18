import Link from "next/link";
import { requireUser, editableAreaIds } from "@/lib/auth";
import { getAreas, getPlansForYear, resolveYear } from "@/lib/data";
import { StatusBadge } from "@/components/StatusBadge";

export default async function Inicio({ searchParams }: { searchParams: Promise<{ vigencia?: string }> }) {
  const { profile } = await requireUser();
  const sp = await searchParams;
  const year = await resolveYear(sp.vigencia);
  const areas = await getAreas();
  const plans = year ? await getPlansForYear(year.id) : [];
  const editable = await editableAreaIds(profile);
  const first = (profile.full_name || "").split(" ")[0];
  const vq = sp.vigencia ? `?vigencia=${year?.year}` : "";

  return (
    <div>
      <section className="mb-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-end">
        <div>
          <p className="mb-2 text-sm font-medium text-accion">Hola{first ? `, ${first}` : ""}</p>
          <h1 className="text-3xl font-semibold leading-tight text-tinta md:text-4xl">Mallas curriculares {year?.year ?? ""}</h1>
          <p className="mt-2 max-w-xl text-slate-600">
            Elija un área para ver sus grados y períodos, o busque un tema en todas las mallas a la vez.
          </p>
        </div>
        <form action="/buscar" role="search" className="flex gap-2">
          <label htmlFor="q-inicio" className="sr-only">Buscar en las mallas</label>
          <input id="q-inicio" name="q" className="campo" placeholder="Buscar un tema, DBA o evidencia" />
          {sp.vigencia && <input type="hidden" name="vigencia" value={year?.year} />}
          <button className="btn-primario shrink-0">Buscar</button>
        </form>
      </section>

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-tinta">Áreas</h2>
        <Link href={`/grados${vq}`} className="text-sm font-medium text-accion hover:underline">
          Ver todas las áreas de un grado
        </Link>
      </div>
      <ul className="grid gap-px overflow-hidden rounded-lg border border-linea bg-linea sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((a) => {
          const plan = plans.find((p) => p.area_id === a.id);
          const canEdit = editable === "all" || editable.has(a.id);
          const showStatus = profile.role === "admin" || !plan || plan.status !== "publicada";
          return (
            <li key={a.id} className="bg-white">
              <Link
                href={`/areas/${a.slug}${vq}`}
                className="group flex h-full items-center gap-4 px-5 py-4 hover:bg-institucional-claro"
              >
                <span aria-hidden className="h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: a.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug text-tinta">{a.name}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    {!plan && <span className="text-xs text-slate-500">Sin malla registrada</span>}
                    {plan && showStatus && <StatusBadge plan={plan.status} />}
                    {canEdit && profile.role !== "admin" && (
                      <span className="rounded-full bg-sinu-claro px-2 py-0.5 text-xs font-semibold text-accion-oscuro">Mi área</span>
                    )}
                  </span>
                </span>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="shrink-0 text-slate-400 group-hover:text-accion">
                  <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
