import "server-only";
import { notFound } from "next/navigation";
import {
  getAreaBySlug,
  getGradeBySlug,
  getPeriods,
  getPlanForArea,
  getProjectsOfPlan,
  getSubjectsOfArea,
  resolveYear,
} from "@/lib/data";

/** Resuelve área, vigencia, plan y (opcionalmente) grado y período desde la URL. */
export async function resolveArea(areaSlug: string, vigencia?: string) {
  const area = await getAreaBySlug(areaSlug);
  if (!area) notFound();
  const year = await resolveYear(vigencia);
  if (!year) notFound();
  const plan = await getPlanForArea(area.id, year.id);
  const projects = plan ? await getProjectsOfPlan(plan.id) : [];
  const subjects = await getSubjectsOfArea(area.id);
  const vq = vigencia ? `?vigencia=${year.year}` : "";
  return { area, year, plan, projects, subjects, vq };
}

/**
 * Resuelve el proyecto de un grado y período. Cuando el área tiene asignaturas
 * (ej. Naturales: Biología, Química, Física) se elige con ?asignatura=<id>;
 * si no se indica, se toma la primera disponible.
 * `vq` conserva vigencia y asignatura para los enlaces de editar e historial.
 */
export async function resolveProject(areaSlug: string, gradeSlug: string, periodNum: string, vigencia?: string, asignatura?: string) {
  const ctx = await resolveArea(areaSlug, vigencia);
  const grade = await getGradeBySlug(gradeSlug);
  if (!grade) notFound();
  const period = (await getPeriods()).find((p) => String(p.number) === periodNum);
  if (!period) notFound();
  const order = (sid: string | null) => (sid ? (ctx.subjects.find((s) => s.id === sid)?.sort_order ?? 99) : -1);
  const options = ctx.projects
    .filter((p) => p.grade_id === grade.id && p.period_id === period.id)
    .sort((a, b) => order(a.subject_id) - order(b.subject_id));
  const project = options.find((p) => (p.subject_id ?? "") === (asignatura ?? "")) ?? options[0] ?? null;
  const subject = project?.subject_id ? (ctx.subjects.find((s) => s.id === project.subject_id) ?? null) : null;
  const params = new URLSearchParams();
  if (vigencia) params.set("vigencia", String(ctx.year.year));
  if (subject && options.length > 1) params.set("asignatura", subject.id);
  const vqp = params.toString() ? `?${params}` : "";
  const tabs = options.map((p) => {
    const q = new URLSearchParams();
    if (vigencia) q.set("vigencia", String(ctx.year.year));
    if (p.subject_id) q.set("asignatura", p.subject_id);
    const sname = p.subject_id ? (ctx.subjects.find((s) => s.id === p.subject_id)?.name ?? "Asignatura") : "General";
    return { id: p.id, label: sname, query: q.toString() ? `?${q}` : "", active: p.id === project?.id };
  });
  return { ...ctx, grade, period, project, subject, options, tabs, vqp };
}
