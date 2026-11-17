import { Breadcrumbs } from "@/components/Breadcrumbs";
import { resolveArea } from "@/lib/context";

export default async function InformacionArea({
  params,
  searchParams,
}: {
  params: Promise<{ area: string }>;
  searchParams: Promise<{ vigencia?: string }>;
}) {
  const { area: slug } = await params;
  const { vigencia } = await searchParams;
  const { area, year, plan, vq } = await resolveArea(slug, vigencia);
  const blocks = plan?.general_info ?? [];
  return (
    <div>
      <Breadcrumbs items={[{ href: "/inicio", label: "Inicio" }, { href: `/areas/${area.slug}${vq}`, label: area.name }, { label: "Información general" }]} />
      <h1 className="mb-1 text-2xl font-bold">Información general · {area.name}</h1>
      <p className="mb-6 text-slate-600">
        Vigencia {year.year}. Texto tomado del documento original, sin cambios (identificación, fines, enfoque, referentes, evaluación y demás).
      </p>
      <article className="tarjeta space-y-3">
        {blocks.map((b, i) =>
          b.type === "p" || b.type === "note" ? (
            <p key={i} className="texto-celda">{b.text}</p>
          ) : (
            <div key={i} className="overflow-x-auto">
              {b.type === "table_dump" && <p className="mb-1 text-sm font-bold text-amber-800">Para revisión: {b.title}</p>}
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {b.rows.map((r, ri) => (
                    <tr key={ri}>
                      {r.map((c, ci) => (
                        <td key={ci} className="texto-celda border border-slate-300 px-2 py-1 align-top">{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        )}
      </article>
    </div>
  );
}
