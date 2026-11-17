import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getGradeBySlug, getPeriods } from "@/lib/data";
import { resolveArea } from "@/lib/context";

export default async function GradoPage({
  params,
  searchParams,
}: {
  params: Promise<{ area: string; grado: string }>;
  searchParams: Promise<{ vigencia?: string }>;
}) {
  const { area: slug, grado } = await params;
  const { vigencia } = await searchParams;
  const { area, year, projects, vq } = await resolveArea(slug, vigencia);
  const grade = await getGradeBySlug(grado);
  if (!grade) notFound();
  const periods = await getPeriods();

  return (
    <div>
      <Breadcrumbs
        items={[{ href: "/inicio", label: "Inicio" }, { href: `/areas/${area.slug}${vq}`, label: area.name }, { label: grade.name }]}
      />
      <h1 className="mb-1 text-2xl font-bold">
        {area.name} · {grade.name}
      </h1>
      <p className="mb-6 text-slate-600">Vigencia {year.year}. Elija un período.</p>
      <ul className="grid gap-4 md:grid-cols-3">
        {periods.map((pe) => {
          const p = projects.find((x) => x.grade_id === grade.id && x.period_id === pe.id);
          return (
            <li key={pe.id}>
              {p ? (
                <Link
                  href={`/areas/${area.slug}/${grade.slug}/${pe.number}${vq}`}
                  className="flex h-full flex-col rounded-xl border-t-8 bg-white p-5 shadow-sm hover:shadow-md"
                  style={{ borderTopColor: area.color }}
                >
                  <span className="text-sm font-bold uppercase text-slate-500">{pe.name}</span>
                  <span className="mt-1 text-xs font-semibold text-slate-500">
                    {p.label} {p.number_text}
                  </span>
                  <span className="mt-1 text-lg font-bold leading-snug">{p.name || "(Sin nombre en el documento)"}</span>
                </Link>
              ) : (
                <div className="rounded-xl bg-slate-100 p-5 text-slate-500">
                  <span className="text-sm font-bold uppercase">{pe.name}</span>
                  <p className="mt-1">No existe una malla registrada para este período.</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
