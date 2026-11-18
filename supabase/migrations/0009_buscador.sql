-- =====================================================================
-- MALLAS COMFACOR · Migración 0009 · Buscador general
-- Búsqueda en español que ignora tildes y mayúsculas, sobre filas y sobre
-- nombre/propósito de cada unidad. Respeta los permisos (security invoker):
-- los docentes solo encuentran mallas publicadas.
-- =====================================================================
create or replace function public.search_curriculum(
  q text, p_year int, p_area uuid default null, p_grade uuid default null, p_period int default null, p_limit int default 60)
returns table (project_id uuid, row_id uuid, area_id uuid, grade_id uuid, period_number int, subject_id uuid,
               label text, number_text text, name text, purpose text, columns jsonb, cells jsonb, rank real)
language sql stable security invoker set search_path = '' as $$
  with tq as (select websearch_to_tsquery('public.es_unaccent'::regconfig, q) as t),
  base as (
    select p.id, c.area_id, p.grade_id, pe.number as period_number, p.subject_id, p.label, p.number_text, p.name, p.purpose, p.columns
    from public.projects p
    join public.curriculum_plans c on c.id = p.plan_id
    join public.academic_years y on y.id = c.academic_year_id and y.year = p_year
    join public.periods pe on pe.id = p.period_id
    where (p_area is null or c.area_id = p_area)
      and (p_grade is null or p.grade_id = p_grade)
      and (p_period is null or pe.number = p_period)
  ),
  hits_rows as (
    select b.*, r.id as row_id, r.cells, ts_rank(r.search_tsv, tq.t) as rank
    from base b join public.curriculum_rows r on r.project_id = b.id, tq
    where r.search_tsv @@ tq.t
  ),
  hits_head as (
    select b.*, null::uuid as row_id, null::jsonb as cells,
           ts_rank(to_tsvector('public.es_unaccent'::regconfig, b.name || ' ' || b.purpose), tq.t) * 2 as rank
    from base b, tq
    where to_tsvector('public.es_unaccent'::regconfig, b.name || ' ' || b.purpose) @@ tq.t
  )
  select id, row_id, area_id, grade_id, period_number, subject_id, label, number_text, name, purpose, columns, cells, rank
  from (select * from hits_head union all select * from hits_rows) h
  order by rank desc, period_number
  limit least(greatest(p_limit, 1), 200);
$$;
revoke execute on function public.search_curriculum from public, anon;
grant execute on function public.search_curriculum to authenticated;
