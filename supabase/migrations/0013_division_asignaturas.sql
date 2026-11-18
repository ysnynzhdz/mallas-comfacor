-- =====================================================================
-- MALLAS COMFACOR · Migración 0013 · Dividir una unidad en asignaturas
-- La unidad original pasa a ser la primera asignatura (conserva su
-- historial: la versión completa sigue en «Historial de cambios») y se
-- crean las demás asignaturas como unidades nuevas. Solo administrador.
-- =====================================================================
alter type public.version_reason add value if not exists 'division';

create or replace function public.split_project(p_project_id uuid, p_parts jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_proj public.projects; v_area uuid; part jsonb; i int := 0; v_subj uuid; v_new uuid; v_ord int;
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede dividir unidades.'; end if;
  select * into v_proj from public.projects where id = p_project_id for update;
  if v_proj.id is null then raise exception 'Unidad no encontrada.'; end if;
  if v_proj.subject_id is not null then raise exception 'Esta unidad ya pertenece a una asignatura.'; end if;
  if jsonb_array_length(p_parts) < 2 then raise exception 'Se necesitan al menos dos asignaturas.'; end if;
  if exists (select 1 from public.change_requests where project_id = p_project_id and status in ('borrador','pendiente')) then
    raise exception 'La unidad tiene solicitudes de cambio abiertas.';
  end if;
  select area_id into v_area from public.curriculum_plans where id = v_proj.plan_id;

  for part in select value from jsonb_array_elements(p_parts) loop
    i := i + 1;
    select id into v_subj from public.subjects where area_id = v_area and name = part->>'subject';
    if v_subj is null then
      v_ord := coalesce((part->>'order')::int, (select coalesce(max(sort_order),0) + 1 from public.subjects where area_id = v_area));
      insert into public.subjects (area_id, name, sort_order) values (v_area, part->>'subject', v_ord) returning id into v_subj;
    end if;
    if i = 1 then
      perform public.apply_snapshot(p_project_id, part->'snapshot');
      update public.projects set subject_id = v_subj, version_no = version_no + 1 where id = p_project_id;
      insert into public.curriculum_versions (project_id, version_no, snapshot, reason, created_by)
      select p_project_id, x.version_no, public.project_snapshot(p_project_id), 'division', (select auth.uid())
        from public.projects x where x.id = p_project_id;
    else
      insert into public.projects (plan_id, grade_id, period_id, subject_id, label, number_text, name, name_is_proposed,
                                   purpose_label, purpose, header_fields, columns, version_no)
      values (v_proj.plan_id, v_proj.grade_id, v_proj.period_id, v_subj, v_proj.label, v_proj.number_text, v_proj.name,
              v_proj.name_is_proposed, v_proj.purpose_label, v_proj.purpose, v_proj.header_fields, v_proj.columns, 1)
      returning id into v_new;
      perform public.apply_snapshot(v_new, part->'snapshot');
      insert into public.curriculum_versions (project_id, version_no, snapshot, reason, created_by)
      values (v_new, 1, public.project_snapshot(v_new), 'division', (select auth.uid()));
    end if;
  end loop;
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'unidad_dividida', 'projects', p_project_id::text,
          jsonb_build_object('asignaturas', (select jsonb_agg(e->>'subject') from jsonb_array_elements(p_parts) e)));
  return i;
end $$;
revoke execute on function public.split_project from public, anon;
grant execute on function public.split_project to authenticated;
