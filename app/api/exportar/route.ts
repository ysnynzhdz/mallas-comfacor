import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAreaBySlug, getGrades, getPeriods, resolveYear } from "@/lib/data";
import type { ExportData } from "@/lib/export/types";
import type { Column, HeaderField } from "@/lib/types";

/**
 * Devuelve el contenido de una malla para descargarla en Word o PDF.
 * Usa la sesión del usuario: los permisos (RLS) deciden qué puede ver.
 * Parámetros: area (obligatorio), vigencia, grado, periodo, asignatura.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const s = await createClient();
  const { data: auth } = await s.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Debe iniciar sesión." }, { status: 401 });

  const area = await getAreaBySlug(sp.get("area") ?? "");
  const year = await resolveYear(sp.get("vigencia") ?? undefined);
  if (!area || !year) return NextResponse.json({ error: "Área o vigencia no encontrada." }, { status: 404 });
  const [grades, periods] = await Promise.all([getGrades(), getPeriods()]);
  const grade = grades.find((g) => g.slug === sp.get("grado"));
  const period = periods.find((p) => String(p.number) === sp.get("periodo"));
  const asignatura = sp.get("asignatura");

  const { data: plan } = await s
    .from("curriculum_plans")
    .select("id")
    .eq("area_id", area.id)
    .eq("academic_year_id", year.id)
    .is("subject_id", null)
    .maybeSingle();
  if (!plan) return NextResponse.json({ error: "No hay malla visible para esta área y vigencia." }, { status: 404 });

  let q = s
    .from("projects")
    .select("id, grade_id, period_id, subject_id, label, number_text, name, purpose_label, purpose, header_fields, columns")
    .eq("plan_id", plan.id);
  if (grade) q = q.eq("grade_id", grade.id);
  if (period) q = q.eq("period_id", period.id);
  if (asignatura) q = q.eq("subject_id", asignatura);
  const { data: projs } = await q;
  type P = { id: string; grade_id: string; period_id: string; subject_id: string | null; label: string; number_text: string; name: string; purpose_label: string; purpose: string; header_fields: HeaderField[]; columns: Column[] };
  const list = (projs ?? []) as P[];
  if (!list.length) return NextResponse.json({ error: "No hay unidades para descargar." }, { status: 404 });

  // Filas por lotes para no superar el tamaño de la consulta
  const rows: { project_id: string; cells: Record<string, unknown>; position: number }[] = [];
  for (let i = 0; i < list.length; i += 40) {
    const { data } = await s
      .from("curriculum_rows")
      .select("project_id, cells, position")
      .in("project_id", list.slice(i, i + 40).map((p) => p.id))
      .order("position")
      .limit(5000);
    rows.push(...((data ?? []) as typeof rows));
  }
  const { data: subj } = await s.from("subjects").select("id, name, sort_order").eq("area_id", area.id);
  const gOrder = (id: string) => grades.find((g) => g.id === id)?.sort_order ?? 0;
  const pNum = (id: string) => periods.find((p) => p.id === id)?.number ?? 0;
  const sOrder = (id: string | null) => (id ? ((subj ?? []).find((x) => x.id === id)?.sort_order ?? 0) : -1);
  list.sort((a, b) => gOrder(a.grade_id) - gOrder(b.grade_id) || sOrder(a.subject_id) - sOrder(b.subject_id) || pNum(a.period_id) - pNum(b.period_id));

  const gName = grade?.name;
  const subjName = asignatura ? (subj ?? []).find((x) => x.id === asignatura)?.name : null;
  const parts = [area.name, gName, period ? period.name : null, subjName, String(year.year)].filter(Boolean) as string[];
  const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const out: ExportData = {
    title: `Malla curricular · ${parts.join(" · ")}`,
    area: area.name,
    year: year.year,
    fileName: `Malla_${fold(parts.join("_"))}`,
    items: list.map((p) => ({
      grade: grades.find((g) => g.id === p.grade_id)?.name ?? "",
      period: pNum(p.period_id),
      subject: p.subject_id ? ((subj ?? []).find((x) => x.id === p.subject_id)?.name ?? null) : null,
      snap: {
        label: p.label, number_text: p.number_text, name: p.name, purpose_label: p.purpose_label, purpose: p.purpose,
        header_fields: p.header_fields ?? [], columns: p.columns ?? [],
        rows: rows.filter((r) => r.project_id === p.id).sort((a, b) => a.position - b.position).map((r) => ({ cells: r.cells as never })),
      },
    })),
  };
  return NextResponse.json(out, { headers: { "Cache-Control": "private, no-store" } });
}
