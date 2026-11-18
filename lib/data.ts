import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AcademicYear, Area, Grade, Period, Plan, Project, RowSnap, Snapshot, Subject } from "@/lib/types";

export const getAreas = cache(async (): Promise<Area[]> => {
  const s = await createClient();
  const { data } = await s.from("areas").select("*").eq("active", true).order("sort_order");
  return (data ?? []) as Area[];
});

export const getGrades = cache(async (): Promise<Grade[]> => {
  const s = await createClient();
  const { data } = await s.from("grades").select("*").order("sort_order");
  return (data ?? []) as Grade[];
});

export const getPeriods = cache(async (): Promise<Period[]> => {
  const s = await createClient();
  const { data } = await s.from("periods").select("*").order("number");
  return (data ?? []) as Period[];
});

export const getYears = cache(async (): Promise<AcademicYear[]> => {
  const s = await createClient();
  const { data } = await s.from("academic_years").select("id, year, status").order("year", { ascending: false });
  return (data ?? []) as AcademicYear[];
});

/** Vigencia elegida (?vigencia=2027) o la vigente más reciente. */
export async function resolveYear(param?: string | string[]): Promise<AcademicYear | null> {
  const years = await getYears();
  const wanted = Number(Array.isArray(param) ? param[0] : param);
  return years.find((y) => y.year === wanted) ?? years.find((y) => y.status === "vigente") ?? years[0] ?? null;
}

export async function getAreaBySlug(slug: string) {
  return (await getAreas()).find((a) => a.slug === slug) ?? null;
}
export async function getGradeBySlug(slug: string) {
  return (await getGrades()).find((g) => g.slug === slug) ?? null;
}

/** Planes visibles para el usuario (RLS: publicados para todos; el admin ve también los importados). */
export const getPlansForYear = cache(async (yearId: string): Promise<Plan[]> => {
  const s = await createClient();
  const { data } = await s.from("curriculum_plans").select("*").eq("academic_year_id", yearId);
  return (data ?? []) as Plan[];
});

export async function getPlanForArea(areaId: string, yearId: string) {
  const plans = await getPlansForYear(yearId);
  return plans.find((p) => p.area_id === areaId && !p.subject_id) ?? plans.find((p) => p.area_id === areaId) ?? null;
}

export const getProjectsOfPlan = cache(async (planId: string): Promise<Project[]> => {
  const s = await createClient();
  const { data } = await s
    .from("projects")
    .select("id, plan_id, grade_id, period_id, subject_id, name_is_proposed, label, number_text, name, purpose_label, purpose, header_fields, columns, version_no, updated_at")
    .eq("plan_id", planId);
  return (data ?? []) as Project[];
});

export async function getRows(projectId: string): Promise<RowSnap[]> {
  const s = await createClient();
  const { data } = await s
    .from("curriculum_rows")
    .select("id, cells, origin_row_id, position")
    .eq("project_id", projectId)
    .order("position");
  return (data ?? []).map((r) => ({ id: r.id as string, cells: r.cells, origin_row_id: r.origin_row_id }));
}

export function toSnapshot(p: Project, rows: RowSnap[]): Snapshot {
  return {
    label: p.label,
    number_text: p.number_text,
    name: p.name,
    purpose_label: p.purpose_label,
    purpose: p.purpose,
    header_fields: p.header_fields ?? [],
    columns: p.columns ?? [],
    rows,
  };
}

export async function unreadCount(): Promise<number> {
  const s = await createClient();
  const { count } = await s.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
}

export const getSubjectsOfArea = cache(async (areaId: string): Promise<Subject[]> => {
  const s = await createClient();
  const { data } = await s.from("subjects").select("id, area_id, name, sort_order").eq("area_id", areaId).order("sort_order");
  return (data ?? []) as Subject[];
});
