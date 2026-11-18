-- =====================================================================
-- MALLAS COMFACOR · Migración 0010 · Vigencias
-- duplicate_year: copia las mallas PUBLICADAS de una vigencia a otra como
--   borrador ('en_revision'), conservando el vínculo fila→fila de origen
--   para el comparador. No publica nada.
-- set_current_year: marca una vigencia como vigente y archiva la anterior.
-- =====================================================================
create or replace function public.duplicate_year(p_from int, p_to int) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_from uuid; v_to uuid; pl record; pr record; v_plan uuid; v_proj uuid; n int := 0;
begin
  if not public.is_admin() then raise exception 'Solo el administrador.'; end if;
  if p_to <= p_from then raise exception 'La nueva vigencia debe ser posterior a %.', p_from; end if;
  select id into v_from from public.academic_years where year = p_from;
  if v_from is null then raise exception 'No existe la vigencia %.', p_from; end if;
  select id into v_to from public.academic_years where year = p_to;
  if v_to is null then
    insert into public.academic_years (year, status, copied_from, created_by) values (p_to, 'borrador', v_from, (select auth.uid())) returning id into v_to;
  end if;

  for pl in select * from public.curriculum_plans
            where academic_year_id = v_from and status in ('publicada','requiere_actualizacion') loop
    if exists (select 1 from public.curriculum_plans x where x.academic_year_id = v_to and x.area_id = pl.area_id
               and coalesce(x.subject_id,'00000000-0000-0000-0000-000000000000') = coalesce(pl.subject_id,'00000000-0000-0000-0000-000000000000')) then
      continue;  -- esa área ya existe en la nueva vigencia: no se toca
    end if;
    insert into public.curriculum_plans (area_id, subject_id, academic_year_id, status, general_info)
    values (pl.area_id, pl.subject_id, v_to, 'en_revision', pl.general_info) returning id into v_plan;
    for pr in select * from public.projects where plan_id = pl.id loop
      insert into public.projects (plan_id, grade_id, period_id, subject_id, label, number_text, name, name_is_proposed,
                                   purpose_label, purpose, header_fields, columns)
      values (v_plan, pr.grade_id, pr.period_id, pr.subject_id, pr.label, pr.number_text, pr.name, pr.name_is_proposed,
              pr.purpose_label, pr.purpose, pr.header_fields, pr.columns)
      returning id into v_proj;
      insert into public.project_grades (project_id, grade_id) select v_proj, grade_id from public.project_grades where project_id = pr.id;
      insert into public.curriculum_rows (project_id, position, cells, origin_row_id)
      select v_proj, r.position, r.cells, r.id from public.curriculum_rows r where r.project_id = pr.id;
    end loop;
    n := n + 1;
  end loop;
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'vigencia_duplicada', 'academic_years', v_to::text, jsonb_build_object('desde', p_from, 'hasta', p_to, 'areas', n));
  return n;
end $$;

create or replace function public.set_current_year(p_year int) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Solo el administrador.'; end if;
  select id into v_id from public.academic_years where year = p_year;
  if v_id is null then raise exception 'No existe la vigencia %.', p_year; end if;
  if exists (select 1 from public.curriculum_plans where academic_year_id = v_id and status not in ('publicada','requiere_actualizacion')) then
    raise exception 'Antes de activar % publique (o elimine) todas sus mallas en revisión.', p_year;
  end if;
  update public.academic_years set status = 'archivada' where status = 'vigente' and id <> v_id;
  update public.academic_years set status = 'vigente' where id = v_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'vigencia_activada', 'academic_years', v_id::text, jsonb_build_object('vigencia', p_year));
end $$;

revoke execute on function public.duplicate_year, public.set_current_year from public, anon;
grant execute on function public.duplicate_year, public.set_current_year to authenticated;
