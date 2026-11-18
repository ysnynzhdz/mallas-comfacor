import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { requireUser } from "@/lib/auth";
import { getGrades, resolveYear } from "@/lib/data";

const NIVEL: Record<string, string> = { preescolar: "Preescolar", primaria: "Básica primaria", secundaria: "Básica secundaria", media: "Media" };

export default async function Grados({ searchParams }: { searchParams: Promise<{ vigencia?: string }> }) {
  await requireUser();
  const { vigencia } = await searchParams;
  const [grades, year] = await Promise.all([getGrades(), resolveYear(vigencia)]);
  const vq = vigencia ? `?vigencia=${year?.year}` : "";
  const levels = [...new Set(grades.map((g) => g.level))];
  return (
    <div>
      <Breadcrumbs items={[{ href: "/inicio", label: "Inicio" }, { label: "Vista por grado" }]} />
      <h1 className="mb-1 text-2xl font-bold">Vista consolidada por grado</h1>
      <p className="mb-6 text-slate-600">Elija un grado para ver, en una sola página, lo que todas las áreas trabajan en cada período. Vigencia {year?.year}.</p>
      {levels.map((lv) => (
        <section key={lv} className="mb-6">
          <h2 className="mb-2 text-lg font-bold">{NIVEL[lv] ?? lv}</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {grades.filter((g) => g.level === lv).map((g) => (
              <li key={g.id}>
                <Link href={`/grados/${g.slug}${vq}`} className="tarjeta block text-center text-lg font-bold hover:bg-institucional-claro">
                  {g.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
