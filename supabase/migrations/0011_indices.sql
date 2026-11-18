-- MALLAS COMFACOR · Migración 0011 · Índices recomendados por el asesor de rendimiento de Supabase
create index if not exists curriculum_plans_year_idx on public.curriculum_plans (academic_year_id);
create index if not exists import_jobs_plan_idx on public.import_jobs (plan_id);
create index if not exists projects_period_idx on public.projects (period_id);
create index if not exists notifications_area_idx on public.notifications (area_id);
create index if not exists curriculum_versions_request_idx on public.curriculum_versions (change_request_id);
