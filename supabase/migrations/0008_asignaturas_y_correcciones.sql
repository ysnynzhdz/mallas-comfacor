-- =====================================================================
-- MALLAS COMFACOR · Migración 0008
-- 1) Proyectos por asignatura (Naturales: Biología, Química, Física;
--    Económicas y políticas: dos asignaturas).
-- 2) Marca de "nombre propuesto" cuando el documento no traía nombre.
-- 3) Registro de correcciones (ortografía y estructura) por importación.
-- 4) import_plan crea asignaturas por nombre y puede REEMPLAZAR un
--    borrador importado que nadie ha editado ni publicado.
-- =====================================================================
alter table public.projects add column if not exists subject_id uuid references public.subjects(id) on delete restrict;
alter table public.projects add column if not exists name_is_proposed boolean not null default false;
alter table public.projects drop constraint if exists projects_plan_id_grade_id_period_id_key;
create unique index if not exists projects_plan_grade_period_subject_unq
  on public.projects (plan_id, grade_id, period_id, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists projects_subject_idx on public.projects (subject_id);

alter table public.import_jobs add column if not exists corrections jsonb not null default '{}'::jsonb;

-- Al aprobar un cambio de nombre, deja de ser "propuesto"
create or replace function public.clear_proposed_name() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.name is distinct from old.name then new.name_is_proposed := false; end if;
  return new;
end $$;
drop trigger if exists projects_clear_proposed on public.projects;
create trigger projects_clear_proposed before update of name on public.projects
  for each row when (old.name_is_proposed) execute function public.clear_proposed_name();
revoke execute on function public.clear_proposed_name from public, anon, authenticated;

drop function if exists public.import_plan(text, int, jsonb);
create or replace function public.import_plan(p_area_slug text, p_year int, d jsonb, p_replace boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_area uuid; v_year uuid; v_src uuid; v_plan uuid; v_proj uuid; v_subj uuid; v_status public.plan_status;
  p jsonb; r jsonb; i int; v_err boolean; v_ord int := 0;
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede cargar importaciones.'; end if;
  select id into v_area from public.areas where slug = p_area_slug;
  select id into v_year from public.academic_years where year = p_year;
  if v_area is null or v_year is null then raise exception 'Área o vigencia no encontrada.'; end if;

  select id, status into v_plan, v_status from public.curriculum_plans
   where area_id = v_area and academic_year_id = v_year and subject_id is null;

  if v_plan is not null then
    if not p_replace then
      raise exception 'Ya existe una malla de esta área para la vigencia %.', p_year;
    end if;
    -- Solo se reemplaza un borrador importado, sin publicar, sin solicitudes ni versiones aprobadas
    if v_status <> 'importada' then raise exception 'La malla ya no es un borrador importado: no se puede reemplazar.'; end if;
    if exists (select 1 from public.change_requests c join public.projects x on x.id = c.project_id where x.plan_id = v_plan) then
      raise exception 'La malla tiene solicitudes de cambio: no se puede reemplazar.';
    end if;
    if exists (select 1 from public.audit_logs where action = 'correccion_importacion'
                and entity_id in (select id::text from public.projects where plan_id = v_plan)) then
      raise exception 'La malla importada ya tiene correcciones manuales: no se puede reemplazar automáticamente.';
    end if;
    delete from public.projects where plan_id = v_plan;               -- filas se borran en cascada
    update public.curriculum_plans set general_info = coalesce(d->'general_info','[]'::jsonb), updated_at = now() where id = v_plan;
  else
    if exists (select 1 from public.document_sources where sha256 = d->>'sha256') then
      raise exception 'Este documento ya fue importado antes (mismo archivo).';
    end if;
    insert into public.curriculum_plans (area_id, academic_year_id, status, general_info)
    values (v_area, v_year, 'importada', coalesce(d->'general_info', '[]'::jsonb)) returning id into v_plan;
  end if;

  select id into v_src from public.document_sources where sha256 = d->>'sha256';
  if v_src is null then
    insert into public.document_sources (area_id, academic_year_id, file_name, sha256, size_bytes, file_modified_at, uploaded_by)
    values (v_area, v_year, d->>'file_name', d->>'sha256', (d->>'size_bytes')::bigint,
            (d->>'file_modified_at')::timestamptz, (select auth.uid()))
    returning id into v_src;
  end if;

  for p in select value from jsonb_array_elements(d->'projects') loop
    v_subj := null;
    if coalesce(p->>'subject','') <> '' then
      select id into v_subj from public.subjects where area_id = v_area and name = p->>'subject';
      if v_subj is null then
        select coalesce(max(sort_order),0) + 1 into v_ord from public.subjects where area_id = v_area;
        insert into public.subjects (area_id, name, sort_order) values (v_area, p->>'subject', v_ord) returning id into v_subj;
      end if;
    end if;
    insert into public.projects (plan_id, grade_id, period_id, subject_id, label, number_text, name, name_is_proposed,
                                 purpose_label, purpose, header_fields, columns)
    values (v_plan,
            (select id from public.grades where slug = p->>'grade'),
            (select id from public.periods where number = (p->>'period')::int),
            v_subj,
            p->>'label', coalesce(p->>'number_text',''), coalesce(p->>'name',''), coalesce((p->>'name_is_proposed')::boolean, false),
            coalesce(p->>'purpose_label','Propósito'),
            coalesce(p->>'purpose',''), coalesce(p->'header_fields','[]'::jsonb), p->'columns')
    returning id into v_proj;
    i := 0;
    for r in select value from jsonb_array_elements(p->'rows') loop
      i := i + 1;
      insert into public.curriculum_rows (project_id, position, cells) values (v_proj, i, r);
    end loop;
  end loop;

  select exists (select 1 from jsonb_array_elements(d->'alerts') a where a->>'nivel' = 'error') into v_err;
  delete from public.import_jobs where plan_id = v_plan;
  insert into public.import_jobs (document_source_id, plan_id, status, summary, alerts, corrections, importer_version, finished_at)
  values (v_src, v_plan, (case when v_err then 'con_alertas' else 'procesado' end)::public.import_status,
          coalesce(d->'summary','{}'::jsonb), coalesce(d->'alerts','[]'::jsonb),
          jsonb_build_object('ortografia', coalesce(d->'corrections','[]'::jsonb), 'estructura', coalesce(d->'estructura','[]'::jsonb)),
          d->>'importer_version', now());
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), case when v_status is not null then 'importacion_reemplazada' else 'importacion_cargada' end,
          'curriculum_plans', v_plan::text,
          jsonb_build_object('archivo', d->>'file_name', 'proyectos', jsonb_array_length(d->'projects')));
  return v_plan;
end $$;
revoke execute on function public.import_plan(text, int, jsonb, boolean) from public, anon;
grant execute on function public.import_plan(text, int, jsonb, boolean) to authenticated;
