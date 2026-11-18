import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { requireUser } from "@/lib/auth";
import { getAreas, getGrades, getPeriods, getYears, resolveYear } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABEL } from "@/lib/table";
import { queryStems, snippet, type Piece } from "@/lib/snippet";
import type { Column } from "@/lib/types";

type Hit = {
  project_id: string;
  row_id: string | null;
  area_id: string;
  grade_id: string;
  period_number: number;
  subject_id: string | null;
  label: string;
  number_text: string;
  name: string;
  purpose: string;
  columns: Column[];
  cells: Record<string, unknown> | null;
  rank: number;
};

function Hl({ pieces }: { pieces: Piece[] }) {
  return (
    <>
      {pieces.map((p, i) => (p.hit ? <mark key={i} className="rounded bg-yellow-200 px-0.5">{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </>
  );
}

export default async function Buscar({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; vigencia?: string; area?: string; grado?: string; periodo?: string; tipo?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 120);
  const [areas, grades, periods, years] = await Promise.all([getAreas(), getGrades(), getPeriods(), getYears()]);
  const year = await resolveYear(sp.vigencia);
  const area = areas.find((a) => a.slug === sp.area);
  const grade = grades.find((g) => g.slug === sp.grado);
  const periodo = periods.find((p) => String(p.number) === sp.periodo)?.number;
  const tipo = sp.tipo && CATEGORY_LABEL[sp.tipo] ? sp.tipo : "";

  let hits: Hit[] = [];
  let error = "";
  if (q.length >= 2 && year) {
    const s = await createClient();
    const { data, error: e } = await s.rpc("search_curriculum", {
      q,
      p_year: year.year,
      p_area: area?.id ?? null,
      p_grade: grade?.id ?? null,
      p_period: periodo ?? null,
      p_limit: 200,
    });
    if (e) error = "No se pudo realizar la búsqueda. Intente con otras palabras.";
    hits = (data ?? []) as Hit[];
  }

  const stems = queryStems(q);
  // Una tarjeta por unidad, con las celdas que coinciden
  type Card = { key: string; hit: Hit; head: Piece[] | null; matches: { col: Column; pieces: Piece[] }[] };
  const cards = new Map<string, Card>();
  for (const h of hits) {
    const card = cards.get(h.project_id) ?? { key: h.project_id, hit: h, head: null, matches: [] };
    if (!h.row_id) {
      card.head = snippet(`${h.name}${h.purpose ? " — " + h.purpose : ""}`, stems, 160);
    } else if (h.cells) {
      for (const col of h.columns) {
        if (tipo && col.category !== tipo) continue;
        const v = h.cells[col.key];
        if (typeof v !== "string") continue;
        const p = snippet(v, stems);
        if (p && card.matches.length < 6) card.matches.push({ col, pieces: p });
      }
    }
    cards.set(h.project_id, card);
  }
  const list = [...cards.values()].filter((c) => (tipo ? c.matches.length > 0 : c.head || c.matches.length > 0));
  const vq = sp.vigencia ? `vigencia=${year?.year}` : "";
  const linkTo = (h: Hit) => {
    const a = areas.find((x) => x.id === h.area_id);
    const g = grades.find((x) => x.id === h.grade_id);
    const params = new URLSearchParams(vq);
    if (h.subject_id) params.set("asignatura", h.subject_id);
    const qs = params.toString();
    return `/areas/${a?.slug}/${g?.slug}/${h.period_number}${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <Breadcrumbs items={[{ href: "/inicio", label: "Inicio" }, { label: "Buscador" }]} />
      <h1 className="mb-1 text-2xl font-bold">Buscador general</h1>
      <p className="mb-4 text-slate-600">
        Busque en todas las mallas un tema, un DBA, una evidencia o un instrumento. No importa si escribe con o sin tildes.
      </p>
      <form className="tarjeta mb-6 grid gap-3 md:grid-cols-6" role="search">
        <div className="md:col-span-6">
          <label htmlFor="q" className="etiqueta">¿Qué busca?</label>
          <input id="q" name="q" defaultValue={q} className="campo" placeholder="Ejemplo: fracciones, ecosistemas, lectura crítica, rúbrica" autoFocus />
        </div>
        <div>
          <label htmlFor="vigencia" className="etiqueta">Vigencia</label>
          <select id="vigencia" name="vigencia" defaultValue={String(year?.year ?? "")} className="campo">
            {years.map((y) => <option key={y.id} value={y.year}>{y.year}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="area" className="etiqueta">Área</label>
          <select id="area" name="area" defaultValue={area?.slug ?? ""} className="campo">
            <option value="">Todas las áreas</option>
            {areas.map((a) => <option key={a.id} value={a.slug}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="grado" className="etiqueta">Grado</label>
          <select id="grado" name="grado" defaultValue={grade?.slug ?? ""} className="campo">
            <option value="">Todos</option>
            {grades.map((g) => <option key={g.id} value={g.slug}>{g.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="periodo" className="etiqueta">Período</label>
          <select id="periodo" name="periodo" defaultValue={periodo ? String(periodo) : ""} className="campo">
            <option value="">Todos</option>
            {periods.map((p) => <option key={p.id} value={p.number}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="tipo" className="etiqueta">Buscar en</label>
          <select id="tipo" name="tipo" defaultValue={tipo} className="campo">
            <option value="">Todas las columnas</option>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}s</option>)}
          </select>
        </div>
        <div className="md:col-span-6">
          <button className="btn-primario">🔎 Buscar</button>
        </div>
      </form>

      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
      {q.length >= 2 && !error && (
        <p className="mb-3 font-semibold" role="status">
          {list.length === 0
            ? `No se encontraron resultados para «${q}».`
            : `${list.length} unidad${list.length === 1 ? "" : "es"} con resultados para «${q}»${list.length >= 120 ? " (se muestran las más relevantes)" : ""}.`}
        </p>
      )}
      <ul className="space-y-3">
        {list.map(({ key, hit, head, matches }) => {
          const a = areas.find((x) => x.id === hit.area_id);
          const g = grades.find((x) => x.id === hit.grade_id);
          return (
            <li key={key} className="tarjeta border-l-8" style={{ borderLeftColor: a?.color }}>
              <Link href={linkTo(hit)} className="block hover:underline">
                <span className="text-xs font-bold uppercase text-slate-500">
                  {a?.name} · {g?.name} · Período {hit.period_number} · {hit.label} {hit.number_text}
                </span>
                <span className="block text-lg font-bold leading-snug">{head ? <Hl pieces={snippet(hit.name, stems, 200) ?? [{ text: hit.name, hit: false }]} /> : hit.name || "(Sin nombre)"}</span>
              </Link>
              {matches.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {matches.map((m, i) => (
                    <li key={i} className="rounded-lg bg-slate-50 p-2">
                      <span className="font-semibold text-institucional">{m.col.label}: </span>
                      <Hl pieces={m.pieces} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
