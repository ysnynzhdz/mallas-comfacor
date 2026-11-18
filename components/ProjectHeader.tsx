import type { Snapshot } from "@/lib/types";

export function ProjectHeader({
  snap,
  area,
  areaColor,
  grade,
  period,
  year,
  version,
  subject,
}: {
  snap: Snapshot;
  area: string;
  areaColor: string;
  grade: string;
  period: number;
  year: number;
  version?: number;
  subject?: string;
}) {
  const fields = snap.header_fields.filter((f) => f.value?.trim() || f.label?.trim());
  const meta = [area, subject, grade, `Período ${period}`, `Vigencia ${year}`].filter(Boolean) as string[];
  return (
    <section className="mb-6 overflow-hidden rounded-lg border border-linea bg-white">
      <div className="h-1.5" style={{ backgroundColor: areaColor }} aria-hidden />
      <div className="p-6">
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
          {meta.map((m, i) => (
            <span key={i} className={i === 0 ? "font-semibold text-tinta" : ""}>
              {m}
            </span>
          ))}
          {version ? <span className="ml-auto rounded-full bg-papel px-2 py-0.5 text-xs text-slate-500">Versión {version}</span> : null}
        </div>
        <p className="text-sm font-medium text-accion">
          {snap.label} {snap.number_text}
        </p>
        <h1 className="mt-1 max-w-4xl text-2xl font-semibold leading-snug text-tinta md:text-[1.75rem]">
          {snap.name || <span className="text-slate-400">(Sin nombre en el documento)</span>}
        </h1>
        <div className="mt-4 max-w-4xl">
          <p className="text-sm font-semibold text-tinta-suave">{snap.purpose_label}</p>
          <p className="texto-celda mt-0.5 leading-relaxed">{snap.purpose || <span className="text-slate-400">(No registrado en el documento)</span>}</p>
        </div>
        {fields.length > 0 && (
          <dl className="mt-5 grid gap-x-8 gap-y-4 border-t border-linea pt-5 sm:grid-cols-2">
            {fields.map((f, i) => (
              <div key={i}>
                {f.label && <dt className="text-sm font-semibold text-tinta-suave">{f.label}</dt>}
                <dd className="texto-celda mt-0.5 text-sm leading-relaxed">{f.value || <span className="text-slate-400">(vacío)</span>}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
