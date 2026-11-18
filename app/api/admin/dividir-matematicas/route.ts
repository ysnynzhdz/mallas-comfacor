import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getGrades, getRows, resolveYear, toSnapshot } from "@/lib/data";
import { MATH_SUBJECTS, splitMathUnit } from "@/lib/split";
import type { Project } from "@/lib/types";

/** Divide las unidades de Matemáticas de 6° a 11° (vigencia actual) en asignaturas. Solo administrador; idempotente. */
export async function POST() {
  await requireAdmin();
  const s = await createClient();
  const year = await resolveYear(undefined);
  const grades = await getGrades();
  const { data: area } = await s.from("areas").select("id").eq("slug", "matematicas").single();
  const { data: plan } = await s.from("curriculum_plans").select("id").eq("area_id", area!.id).eq("academic_year_id", year!.id).is("subject_id", null).single();
  const targetGrades = grades.filter((g) => MATH_SUBJECTS[g.slug]);
  const { data: projs } = await s
    .from("projects")
    .select("id, plan_id, grade_id, period_id, subject_id, name_is_proposed, label, number_text, name, purpose_label, purpose, header_fields, columns, version_no")
    .eq("plan_id", plan!.id)
    .is("subject_id", null)
    .in("grade_id", targetGrades.map((g) => g.id));
  const results: { unidad: string; resultado: string }[] = [];
  for (const p of projs ?? []) {
    const grade = targetGrades.find((g) => g.id === p.grade_id)!;
    const snap = toSnapshot(p as unknown as Project, await getRows(p.id));
    const parts = splitMathUnit(grade.slug, snap);
    if ("error" in parts) {
      results.push({ unidad: `${grade.name} ${p.period_id}`, resultado: `No dividida: ${parts.error}` });
      continue;
    }
    const clean = parts.map((x) => ({ subject: x.subject, order: x.order, snapshot: { ...x.snapshot, rows: x.snapshot.rows.map((r) => ({ cells: r.cells })) } }));
    const { error } = await s.rpc("split_project", { p_project_id: p.id, p_parts: clean });
    results.push({ unidad: `${grade.name}`, resultado: error ? `Error: ${error.message}` : parts.map((x) => x.subject).join(", ") });
  }
  return NextResponse.json({ divididas: results.filter((r) => !r.resultado.startsWith("Error") && !r.resultado.startsWith("No")).length, results });
}
