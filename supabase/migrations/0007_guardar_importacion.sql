-- MALLAS COMFACOR · Migración 0007 · Corrección de una malla importada antes de publicarla (solo administrador)
create or replace function public.admin_save_imported_project(p_project_id uuid, s jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_status public.plan_status;
begin
  if not public.is_admin() then raise exception 'Solo el administrador.'; end if;
  select c.status into v_status from public.projects p join public.curriculum_plans c on c.id = p.plan_id where p.id = p_project_id;
  if v_status is null then raise exception 'Proyecto no encontrado.'; end if;
  if v_status in ('publicada','requiere_actualizacion') then
    raise exception 'La malla ya está publicada: los cambios deben hacerse con una solicitud.';
  end if;
  perform public.validate_proposal(s);
  perform public.apply_snapshot(p_project_id, s);
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'correccion_importacion', 'projects', p_project_id::text, '{}'::jsonb);
end $$;
revoke execute on function public.admin_save_imported_project from public, anon;
grant execute on function public.admin_save_imported_project to authenticated;
