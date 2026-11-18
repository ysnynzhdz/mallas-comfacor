import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DiffView } from "@/components/DiffView";
import { requireUser } from "@/lib/auth";
import { getAreas, getGrades, getPeriods, getYears } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { Column, HeaderField, RowSnap, Snapshot } from "@/lib/types";

type P = {
  id: string; subject_id: string | null; label: string; number_text: string; name: string; purpose_label: string; purpose: string;
  header_fields: HeaderField[]; columns: Column[];
};

async function loadProject(yearNum: number, areaId: string, gradeId: string, periodId: string) {
  const s = await createClient();
  const { data: plan } = await s
    .from("curriculum_plans")
    .select("id, status, year:academic_years!inner(year)")
    .eq("area_id", areaId)
    .eq("academic_years.year", yearNum)
    .maybeSingle();
  if (!plan) return { plan: null, projects: [] as (P & { rows: RowSnap[] })[] };
  const { data: projs } = await s
    .from("projects")
    .select("id, subject_id, label, number_text, name, purpose_label, purpose, header_fields, columns")
    .eq("plan_id", plan.id)
    .eq("grade_id", gradeId)
    .eq("period_id", periodId);
  const list = (projs ?? []) as P[];
  const { data: rows } = await s
    .from("curriculum_rows")
    .select("id, project_id, cells, origin_row_id, position")
    .in("project_id", list.length ? list.map((p) => p.id) : ["00000000-0000-0000-0000-000000000000"])
    .order("position");
  return {
    plan: plan as unknown as { id: string; status: string },
    projects: list.map((p) => ({
      ...p,
      rows: (rows ?? []).filter((r) => r.project_id === p.id).map((r) => ({ id: r.id as string, cells: r.cells, origin_row_id: r.origin_row_id })),
    })),
  };
}

const snap = (p: P, rows: RowSnap[]): Snapshot => ({
  label: p.label, number_text: p.number_text, name: p.name, purpose_label: p.purpose_label, purpose: p.purpose,
  header_fields: p.header_fields ?? [], columns: p.columns ?? [], rows,
});

export default async function Comparar({
  searchParams,
}: {
  searchParams: Promise<{ area?: string; grado?: string; periodo?: string; desde?: string; hasta?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const [areas, grades, periods, years] = await Promise.all([getAreas(), getGrades(), getPeriods(), getYears()]);
  const sorted = [...years].sort((a, b) => a.year - b.year);
  const area = areas.find((a) => a.slug === sp.area);
  const grade = grades.find((g) => g.slug === sp.grado);
  const period = periods.find((p) => String(p.number) === sp.periodo) ?? periods[0];
  const desde = Number(sp.desde) || sorted[Math.max(0, sorted.length - 2)]?.year;
  const hasta = Number(sp.hasta) || sorted[sorted.length - 1]?.year;
  const ready = area && grade && period && desde && hasta && desde !== hasta;

  let content: React.ReactNode = null;
  if (ready) {
    const [a, b] = await Promise.all([loadProject(desde, area.id, grade.id, period.id), loadProject(hasta, area.id, grade.id, period.id)]);
    if (!a.plan || !b.plan || (!a.projects.length && !b.projects.length)) {
      content = (
        <p className="tarjeta">
          No hay malla de {area.name}, {grade.name}, {period.name} en {!a.plan || !a.projects.length ? desde : hasta}
          {!a.plan && !b.plan ? ` ni en ${hasta}` : ""}. Si la vigencia nueva aún está en preparación, solo el administrador puede verla.
        </p>
      );
    } else {
      const subjects = [...new Set([...a.projects, ...b.projects].map((p) => p.subject_id ?? ""))];
      const s = await createClient();
      const { data: subj } = await s.from("subjects").select("id, name");
      content = subjects.map((sid) => {
        const pa = a.projects.find((p) => (p.subject_id ?? "") === sid);
        const pb = b.projects.find((p) => (p.subject_id ?? "") === sid);
        const title = sid ? (subj ?? []).find((x) => x.id === sid)?.name : null;
        if (!pa || !pb) {
          return (
            <section key={sid} className="tarjeta mb-4">
              {title && <h2 className="mb-1 font-bold">{title}</h2>}
              <p>Esta unidad solo existe en {pa ? desde : hasta}.</p>
            </section>
          );
        }
        // En la vigencia nueva cada fila recuerda de qué fila vino (origin_row_id): así se emparejan.
        const afterRows = pb.rows.map((r, i) => ({ ...r, id: r.origin_row_id ?? `nueva-${i}` }));
        return (
          <section key={sid} className="mb-6">
            {title && <h2 className="mb-2 text-lg font-bold">{title}</h2>}
            <p className="mb-2 text-sm text-slate-600">
              {pb.label} {pb.number_text}: <strong>{pb.name}</strong>
            </p>
            <DiffView before={snap(pa, pa.rows)} after={snap(pb, afterRows)} beforeLabel={`VIGENCIA ${desde}`} afterLabel={`VIGENCIA ${hasta}`} />
          </section>
        );
      });
    }
  }

  return (
    <div>
      <Breadcrumbs items={[{ href: "/inicio", label: "Inicio" }, { label: "Comparador de vigencias" }]} />
      <h1 className="mb-1 text-2xl font-bold">Comparador de vigencias</h1>
      <p className="mb-4 text-slate-600">Vea qué cambió en una malla de un año escolar a otro: filas nuevas, modificadas y eliminadas.</p>
      {sorted.length < 2 && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Por ahora solo existe la vigencia {sorted[0]?.year}. El comparador tendrá datos cuando el administrador prepare la siguiente vigencia.
        </p>
      )}
      <form className="tarjeta mb-6 grid gap-3 md:grid-cols-6">
        <div className="md:col-span-2">
          <label className="etiqueta" htmlFor="area">Área</label>
          <select id="area" name="area" defaultValue={area?.slug ?? ""} className="campo" required>
            <option value="" disabled>Elija el área</option>
            {areas.map((a) => <option key={a.id} value={a.slug}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="etiqueta" htmlFor="grado">Grado</label>
          <select id="grado" name="grado" defaultValue={grade?.slug ?? ""} className="campo" required>
            <option value="" disabled>Elija</option>
            {grades.map((g) => <option key={g.id} value={g.slug}>{g.name}</option>)}
          </select>
        </div>
        <div>
          <label className="etiqueta" htmlFor="periodo">Período</label>
          <select id="periodo" name="periodo" defaultValue={String(period?.number ?? 1)} className="campo">
            {periods.map((p) => <option key={p.id} value={p.number}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="etiqueta" htmlFor="desde">Desde</label>
          <select id="desde" name="desde" defaultValue={String(desde ?? "")} className="campo">
            {sorted.map((y) => <option key={y.id} value={y.year}>{y.year}</option>)}
          </select>
        </div>
        <div>
          <label className="etiqueta" htmlFor="hasta">Hasta</label>
          <select id="hasta" name="hasta" defaultValue={String(hasta ?? "")} className="campo">
            {sorted.map((y) => <option key={y.id} value={y.year}>{y.year}</option>)}
          </select>
        </div>
        <div className="md:col-span-6"><button className="btn-primario">Comparar</button></div>
      </form>
      {area && grade && desde === hasta && <p className="tarjeta">Elija dos vigencias distintas.</p>}
      {content}
      {ready && (
        <p className="mt-4 text-sm">
          <Link className="font-semibold text-institucional underline" href={`/areas/${area.slug}/${grade.slug}/${period.number}?vigencia=${hasta}`}>
            Ver la malla de {hasta} →
          </Link>
        </p>
      )}
    </div>
  );
}
