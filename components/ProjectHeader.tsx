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
  return (
    <section className="tarjeta mb-6 border-t-8" style={{ borderTopColor: areaColor }}>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-institucional-claro px-3 py-1 font-semibold text-institucional">{area}</span>
        {subject && <span className="rounded-full bg-institucional-claro px-3 py-1 font-semibold text-institucional">{subject}</span>}
        <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold">{grade}</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold">Período {period}</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold">Vigencia {year}</span>
        {version ? <span className="rounded-full bg-slate-100 px-3 py-1">Versión {version}</span> : null}
      </div>
      <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
        {snap.label} {snap.number_text}
      </p>
      <h1 className="mb-3 text-2xl font-bold text-slate-900">
        {snap.name || <span className="text-slate-400">(Sin nombre en el documento)</span>}
      </h1>
      <div className="mb-3">
        <p className="text-sm font-bold text-institucional">{snap.purpose_label}</p>
        <p className="texto-celda">{snap.purpose || <span className="text-slate-400">(No registrado en el documento)</span>}</p>
      </div>
      {fields.length > 0 && (
        <dl className="grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2">
          {fields.map((f, i) => (
            <div key={i}>
              {f.label && <dt className="text-sm font-bold text-institucional">{f.label}</dt>}
              <dd className="texto-celda text-sm">{f.value || <span className="text-slate-400">(vacío)</span>}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
