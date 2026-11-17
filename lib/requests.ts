import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { RequestStatus, Snapshot } from "@/lib/types";

export const REQUEST_SELECT = `id, status, summary, created_at, submitted_at, decided_at, reviewer_notes, base_version_no, requested_by,
  proposed, project_id,
  requester:profiles!change_requests_requested_by_fkey(full_name, email),
  projects(id, name, label, number_text, version_no,
    grade:grades!projects_grade_id_fkey(slug, name),
    period:periods(number),
    plan:curriculum_plans(area:areas(slug, name, color), year:academic_years(year)))`;

export type RequestRow = {
  id: string;
  status: RequestStatus;
  summary: string;
  created_at: string;
  submitted_at: string | null;
  decided_at: string | null;
  reviewer_notes: string | null;
  base_version_no: number;
  requested_by: string;
  proposed: Snapshot;
  project_id: string;
  requester: { full_name: string; email: string } | null;
  projects: {
    id: string;
    name: string;
    label: string;
    number_text: string;
    version_no: number;
    grade: { slug: string; name: string };
    period: { number: number };
    plan: { area: { slug: string; name: string; color: string }; year: { year: number } };
  };
};

export function contextOf(r: RequestRow) {
  const p = r.projects;
  return {
    text: `${p.plan.area.name} · ${p.grade.name} · Período ${p.period.number} · ${p.plan.year.year}`,
    href: `/areas/${p.plan.area.slug}/${p.grade.slug}/${p.period.number}?vigencia=${p.plan.year.year}`,
    color: p.plan.area.color,
  };
}

export async function listRequests(filter: { mine?: string; status?: RequestStatus[] }) {
  const s = await createClient();
  let q = s.from("change_requests").select(REQUEST_SELECT).order("created_at", { ascending: false }).limit(200);
  if (filter.mine) q = q.eq("requested_by", filter.mine);
  if (filter.status) q = q.in("status", filter.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RequestRow[];
}

export const fecha = (s: string | null) =>
  s ? new Date(s).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }) : "—";
