import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { StatusBadge } from "@/components/StatusBadge";
import { getGrades } from "@/lib/data";
import { resolveArea } from "@/lib/context";

export default async function AreaPage({
  params,
  searchParams,
}: {
  params: Promise<{ area: string }>;
  searchParams: Promise<{ vigencia?: string }>;
}) {
  const { area: slug } = await params;
  const { vigencia } = await searchParams;
  const { area, year, plan, projects, vq } = await resolveArea(slug, vigencia);
  const grades = await getGrades();
  const withData = new Set(projects.map((p) => p.grade_id));

  return (
    <div>
      <Breadcrumbs items={[{ href: "/inicio", label: "Inicio" }, { label: area.name }]} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold" style={{ color: area.color }}>
          {area.name}
        </h1>
        <span className="text-slate-600">Vigencia {year.year}</span>
        {plan && <StatusBadge plan={plan.status} />}
      </div>
      {!plan ? (
        <p className="tarjeta text-slate-700">Esta área todavía no tiene una malla registrada para la vigencia {year.year}.</p>
      ) : (
        <>
          <h2 className="mb-3 text-lg font-bold">Elija un grado</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {grades.map((g) => {
              const has = withData.has(g.id);
              return (
                <li key={g.id}>
                  {has ? (
                    <Link
                      href={`/areas/${area.slug}/${g.slug}${vq}`}
                      className="flex min-h-16 flex-col items-center justify-center rounded-xl bg-white p-3 text-center font-bold shadow-sm ring-1 ring-slate-200 hover:ring-2 hover:ring-institucional"
                    >
                      <span className="text-xl">{g.short_name}</span>
                      <span className="text-sm text-slate-600">{g.name}</span>
                    </Link>
                  ) : (
                    <div className="flex min-h-16 flex-col items-center justify-center rounded-xl bg-slate-100 p-3 text-center text-slate-400">
                      <span className="text-xl font-bold">{g.short_name}</span>
                      <span className="text-xs">Sin malla registrada</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {plan.general_info?.length > 0 && (
            <p className="mt-6">
              <Link href={`/areas/${area.slug}/informacion${vq}`} className="btn-secundario">
                Ver información general del área
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
