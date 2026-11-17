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

  return (
    <div>
      <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">¡Bienvenido{first ? `, ${first}` : ""}!</h1>
        <p className="mt-1 text-slate-600">
          Consulte las mallas curriculares de la institución. Vigencia: <strong>{year?.year ?? "—"}</strong>
        </p>
      </section>

      <h2 className="mb-3 text-lg font-bold">Áreas</h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {areas.map((a) => {
          const plan = plans.find((p) => p.area_id === a.id);
          const canEdit = editable === "all" || editable.has(a.id);
          return (
            <li key={a.id}>
              <Link
                href={`/areas/${a.slug}`}
                className="flex h-full flex-col justify-between rounded-xl border-l-8 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                style={{ borderLeftColor: a.color }}
              >
                <span className="text-lg font-bold leading-tight">{a.name}</span>
                <span className="mt-3 flex flex-wrap items-center gap-2">
                  {plan ? <StatusBadge plan={plan.status} /> : <span className="text-xs text-slate-500">Sin malla registrada</span>}
                  {canEdit && profile.role !== "admin" && (
                    <span className="rounded-full bg-institucional-claro px-2 py-1 text-xs font-bold text-institucional">Mi área</span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
