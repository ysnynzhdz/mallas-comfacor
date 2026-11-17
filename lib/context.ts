import "server-only";
import { notFound } from "next/navigation";
import { getAreaBySlug, getGradeBySlug, getPeriods, getPlanForArea, getProjectsOfPlan, resolveYear } from "@/lib/data";

/** Resuelve área, vigencia, plan y (opcionalmente) grado y período desde la URL. */
export async function resolveArea(areaSlug: string, vigencia?: string) {
  const area = await getAreaBySlug(areaSlug);
  if (!area) notFound();
  const year = await resolveYear(vigencia);
  if (!year) notFound();
  const plan = await getPlanForArea(area.id, year.id);
  const projects = plan ? await getProjectsOfPlan(plan.id) : [];
  const vq = vigencia ? `?vigencia=${year.year}` : "";
  return { area, year, plan, projects, vq };
}

export async function resolveProject(areaSlug: string, gradeSlug: string, periodNum: string, vigencia?: string) {
  const ctx = await resolveArea(areaSlug, vigencia);
  const grade = await getGradeBySlug(gradeSlug);
  if (!grade) notFound();
  const period = (await getPeriods()).find((p) => String(p.number) === periodNum);
  if (!period) notFound();
  const project = ctx.projects.find((p) => p.grade_id === grade.id && p.period_id === period.id) ?? null;
  return { ...ctx, grade, period, project };
}
