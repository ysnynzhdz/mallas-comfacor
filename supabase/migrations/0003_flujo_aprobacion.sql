-- =====================================================================
-- MALLAS COMFACOR · Migración 0003 · Flujo de solicitudes, aprobación,
-- publicación de importaciones, restauración y notificaciones.
-- Todas las funciones verifican permisos y hacen todo o nada.
-- =====================================================================

-- Fotografía completa de un proyecto (uso interno)
create or replace function public.project_snapshot(p_project_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'label', p.label, 'number_text', p.number_text, 'name', p.name,
    'purpose_label', p.purpose_label, 'purpose', p.purpose,
    'header_fields', p.header_fields, 'columns', p.columns,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'cells', r.cells, 'origin_row_id', r.origin_row_id)
                                       order by r.position)
                      from public.curriculum_rows r where r.project_id = p.id), '[]'::jsonb))
  from public.projects p where p.id = p_project_id;
$$;

-- Aplica una fotografía a un proyecto (uso interno; no se expone)
create or replace function public.apply_snapshot(p_project_id uuid, s jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; i int := 0; v_id uuid; keep uuid[] := '{}';
begin
  update public.projects set
    label = coalesce(s->>'label', label),
    number_text = coalesce(s->>'number_text', number_text),
    name = coalesce(s->>'name', ''),
    purpose_label = coalesce(s->>'purpose_label', purpose_label),
    purpose = coalesce(s->>'purpose', ''),
    header_fields = coalesce(s->'header_fields', '[]'::jsonb),
    columns = coalesce(s->'columns', columns)
  where id = p_project_id;

  -- filas que se conservan (las que existen en este proyecto)
  select coalesce(array_agg(x.id), '{}') into keep
  from public.curriculum_rows x
  where x.project_id = p_project_id
    and x.id::text in (select e->>'id' from jsonb_array_elements(coalesce(s->'rows','[]'::jsonb)) e where e ? 'id');

  delete from public.curriculum_rows where project_id = p_project_id and not (id = any(keep));

  for r in select value from jsonb_array_elements(coalesce(s->'rows','[]'::jsonb)) loop
    i := i + 1;
    v_id := case when r ? 'id' and (r->>'id') ~ '^[0-9a-f-]{36}$' then (r->>'id')::uuid end;
    if v_id is not null and v_id = any(keep) then
      update public.curriculum_rows set position = i, cells = coalesce(r->'cells','{}'::jsonb) where id = v_id;
    else
      insert into public.curriculum_rows (project_id, position, cells, origin_row_id)
      values (p_project_id, i, coalesce(r->'cells','{}'::jsonb),
              case when (r->>'origin_row_id') ~ '^[0-9a-f-]{36}$' then (r->>'origin_row_id')::uuid end);
    end if;
  end loop;
end $$;

-- Valida que una propuesta tenga la forma correcta y tamaños razonables
create or replace function public.validate_proposal(s jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare r jsonb; k text; v text;
begin
  if jsonb_typeof(s) <> 'object' or jsonb_typeof(s->'rows') <> 'array' or jsonb_typeof(s->'columns') <> 'array' then
    raise exception 'La propuesta no tiene el formato esperado.';
  end if;
  if jsonb_array_length(s->'rows') > 400 then raise exception 'Demasiadas filas (máximo 400).'; end if;
  if length(coalesce(s->>'name','')) > 1000 or length(coalesce(s->>'purpose','')) > 20000 then
    raise exception 'El nombre o el propósito son demasiado largos.';
  end if;
  for r in select value from jsonb_array_elements(s->'rows') loop
    if jsonb_typeof(r->'cells') <> 'object' then raise exception 'Fila sin celdas.'; end if;
    for k, v in select key, value from jsonb_each_text(r->'cells') loop
      if length(v) > 20000 then raise exception 'Un texto supera el tamaño permitido.'; end if;
    end loop;
  end loop;
end $$;

-- Notifica a todos los administradores activos
create or replace function public.notify_admins(p_type text, p_area uuid, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (recipient_id, type, area_id, title, body, link)
  select id, p_type, p_area, p_title, p_body, p_link from public.profiles where role = 'admin' and active;
$$;

-- Contexto descriptivo de un proyecto: "Matemáticas · Séptimo · Período 2 · 2024"
create or replace function public.project_context(p_project_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select a.name || coalesce(' (' || s.name || ')', '') || ' · ' || g.name || ' · Período ' || pe.number || ' · ' || y.year
  from public.projects p
  join public.curriculum_plans c on c.id = p.plan_id
  join public.areas a on a.id = c.area_id
  left join public.subjects s on s.id = c.subject_id
  join public.academic_years y on y.id = c.academic_year_id
  join public.grades g on g.id = p.grade_id
  join public.periods pe on pe.id = p.period_id
  where p.id = p_project_id;
$$;

-- 1) Guardar propuesta (borrador). Crea o actualiza la solicitud del docente.
create or replace function public.save_change_request(p_project_id uuid, p_proposed jsonb, p_summary text default '',
                                                      p_request_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_proj public.projects; v_plan public.curriculum_plans; v_year public.academic_years; v_id uuid;
begin
  if not public.is_active_user() then raise exception 'Su cuenta no está activa.'; end if;
  select * into v_proj from public.projects where id = p_project_id;
  if not found then raise exception 'Proyecto no encontrado.'; end if;
  select * into v_plan from public.curriculum_plans where id = v_proj.plan_id;
  select * into v_year from public.academic_years where id = v_plan.academic_year_id;
  if not public.can_edit_area(v_plan.area_id, v_plan.academic_year_id) then
    raise exception 'No tiene permiso para editar esta área.';
  end if;
  if v_plan.status not in ('publicada','requiere_actualizacion') then
    raise exception 'Esta malla aún no está publicada; no se pueden proponer cambios.';
  end if;
  if v_year.status = 'archivada' then raise exception 'La vigencia % está archivada y no se puede editar.', v_year.year; end if;
  perform public.validate_proposal(p_proposed);

  if p_request_id is null then
    insert into public.change_requests (project_id, requested_by, status, base_version_no, proposed, summary)
    values (p_project_id, v_uid, 'borrador', v_proj.version_no, p_proposed, coalesce(p_summary,''))
    returning id into v_id;
  else
    update public.change_requests
       set proposed = p_proposed, summary = coalesce(p_summary,''), status = 'borrador',
           base_version_no = v_proj.version_no, decided_by = null, decided_at = null
     where id = p_request_id and requested_by = v_uid and project_id = p_project_id
       and status in ('borrador','rechazado')
    returning id into v_id;
    if v_id is null then raise exception 'La solicitud no existe o ya no se puede modificar.'; end if;
  end if;
  return v_id;
end $$;

-- 2) Enviar a aprobación
create or replace function public.submit_change_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_req public.change_requests; v_area uuid; v_name text;
begin
  select * into v_req from public.change_requests
   where id = p_request_id and requested_by = (select auth.uid()) for update;
  if not found or v_req.status <> 'borrador' then raise exception 'Solo se pueden enviar solicitudes en borrador.'; end if;
  update public.change_requests set status = 'pendiente', submitted_at = now() where id = p_request_id;
  select c.area_id into v_area from public.projects p join public.curriculum_plans c on c.id = p.plan_id where p.id = v_req.project_id;
  select full_name into v_name from public.profiles where id = v_req.requested_by;
  perform public.notify_admins('solicitud_recibida', v_area, 'Nueva solicitud de modificación',
    coalesce(nullif(v_name,''),'Un docente') || ' propone cambios en ' || public.project_context(v_req.project_id),
    '/admin/solicitudes/' || p_request_id);
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'solicitud_enviada', 'change_requests', p_request_id::text, jsonb_build_object('proyecto', v_req.project_id));
end $$;

-- Descartar un borrador propio
create or replace function public.discard_change_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.change_requests
   where id = p_request_id and requested_by = (select auth.uid()) and status = 'borrador';
  if not found then raise exception 'Solo se pueden descartar borradores propios.'; end if;
end $$;

-- 3) Aprobar (solo administrador)
create or replace function public.approve_change_request(p_request_id uuid, p_notes text default null,
                                                         p_force boolean default false) returns int
language plpgsql security definer set search_path = '' as $$
declare v_req public.change_requests; v_proj public.projects; v_area uuid; v_new int;
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede aprobar.'; end if;
  select * into v_req from public.change_requests where id = p_request_id for update;
  if not found or v_req.status <> 'pendiente' then raise exception 'La solicitud no está pendiente de aprobación.'; end if;
  select * into v_proj from public.projects where id = v_req.project_id for update;
  if v_proj.version_no <> v_req.base_version_no and not p_force then
    raise exception 'CONFLICTO: la malla cambió (versión %) después de que se preparó esta propuesta (versión %). Revise antes de aprobar.',
      v_proj.version_no, v_req.base_version_no;
  end if;

  perform public.apply_snapshot(v_proj.id, v_req.proposed);
  v_new := v_proj.version_no + 1;
  update public.projects set version_no = v_new where id = v_proj.id;
  insert into public.curriculum_versions (project_id, version_no, snapshot, reason, change_request_id, created_by)
  values (v_proj.id, v_new, public.project_snapshot(v_proj.id), 'aprobacion', p_request_id, (select auth.uid()));

  update public.change_requests set status = 'aprobado', decided_by = (select auth.uid()), decided_at = now(),
         reviewer_notes = p_notes where id = p_request_id;
  insert into public.approval_records (change_request_id, action, actor_id, notes)
  values (p_request_id, 'aprobado', (select auth.uid()), p_notes);
  update public.curriculum_plans set last_published_at = now() where id = v_proj.plan_id
  returning area_id into v_area;

  insert into public.notifications (recipient_id, type, area_id, title, body, link)
  values (v_req.requested_by, 'solicitud_aprobada', v_area, 'Su modificación fue aprobada',
          public.project_context(v_proj.id) || coalesce(' — Observaciones: ' || nullif(p_notes,''), ''),
          '/mis-solicitudes');
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'solicitud_aprobada', 'change_requests', p_request_id::text,
          jsonb_build_object('proyecto', v_proj.id, 'version', v_new, 'forzada', p_force));
  return v_new;
end $$;

-- 4) Rechazar (solo administrador; motivo obligatorio)
create or replace function public.reject_change_request(p_request_id uuid, p_notes text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_req public.change_requests; v_area uuid;
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede rechazar.'; end if;
  if coalesce(trim(p_notes),'') = '' then raise exception 'Debe escribir el motivo del rechazo.'; end if;
  select * into v_req from public.change_requests where id = p_request_id for update;
  if not found or v_req.status <> 'pendiente' then raise exception 'La solicitud no está pendiente de aprobación.'; end if;
  update public.change_requests set status = 'rechazado', decided_by = (select auth.uid()), decided_at = now(),
         reviewer_notes = p_notes where id = p_request_id;
  insert into public.approval_records (change_request_id, action, actor_id, notes)
  values (p_request_id, 'rechazado', (select auth.uid()), p_notes);
  select c.area_id into v_area from public.projects p join public.curriculum_plans c on c.id = p.plan_id where p.id = v_req.project_id;
  insert into public.notifications (recipient_id, type, area_id, title, body, link)
  values (v_req.requested_by, 'solicitud_rechazada', v_area, 'Su modificación fue rechazada',
          public.project_context(v_req.project_id) || ' — Motivo: ' || p_notes, '/mis-solicitudes');
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'solicitud_rechazada', 'change_requests', p_request_id::text, jsonb_build_object('motivo', p_notes));
end $$;

-- 5) Observación sin decidir
create or replace function public.add_request_observation(p_request_id uuid, p_notes text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_req public.change_requests;
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede agregar observaciones.'; end if;
  if coalesce(trim(p_notes),'') = '' then raise exception 'La observación está vacía.'; end if;
  select * into v_req from public.change_requests where id = p_request_id;
  if not found then raise exception 'Solicitud no encontrada.'; end if;
  insert into public.approval_records (change_request_id, action, actor_id, notes)
  values (p_request_id, 'observacion', (select auth.uid()), p_notes);
  insert into public.notifications (recipient_id, type, title, body, link)
  values (v_req.requested_by, 'observacion', 'Nueva observación del administrador',
          public.project_context(v_req.project_id) || ' — ' || p_notes, '/mis-solicitudes');
end $$;

-- 6) Publicar una malla importada (solo administrador)
create or replace function public.publish_imported_plan(p_plan_id uuid, p_notes text default null) returns int
language plpgsql security definer set search_path = '' as $$
declare v_plan public.curriculum_plans; p record; n int := 0; v_area_name text; j record;
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede publicar.'; end if;
  select * into v_plan from public.curriculum_plans where id = p_plan_id for update;
  if not found or v_plan.status not in ('importada','en_revision','pendiente_aprobacion') then
    raise exception 'Esta malla no está en revisión de importación.';
  end if;
  for p in select id from public.projects where plan_id = p_plan_id loop
    update public.projects set version_no = version_no + 1 where id = p.id;
    insert into public.curriculum_versions (project_id, version_no, snapshot, reason, created_by)
    select p.id, x.version_no, public.project_snapshot(p.id), 'importacion', (select auth.uid())
      from public.projects x where x.id = p.id;
    n := n + 1;
  end loop;
  update public.curriculum_plans set status = 'publicada', last_published_at = now() where id = p_plan_id;
  for j in select id from public.import_jobs where plan_id = p_plan_id and status <> 'aprobado' loop
    update public.import_jobs set status = 'aprobado', reviewed_by = (select auth.uid()), approved_at = now() where id = j.id;
    insert into public.approval_records (import_job_id, action, actor_id, notes)
    values (j.id, 'importacion_aprobada', (select auth.uid()), p_notes);
  end loop;
  select name into v_area_name from public.areas where id = v_plan.area_id;
  insert into public.notifications (recipient_id, type, area_id, title, body, link)
  select pr.id, 'malla_publicada', v_plan.area_id, 'Nueva malla publicada',
         'Ya puede consultar la malla de ' || v_area_name, '/areas/' || (select slug from public.areas where id = v_plan.area_id)
  from public.profiles pr where pr.active and pr.id <> (select auth.uid());
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'malla_publicada', 'curriculum_plans', p_plan_id::text, jsonb_build_object('proyectos', n));
  return n;
end $$;

-- Cambiar estado de revisión de una importación (sin publicar)
create or replace function public.set_plan_review_status(p_plan_id uuid, p_status public.plan_status) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador.'; end if;
  if p_status not in ('importada','en_revision','pendiente_aprobacion','requiere_actualizacion') then
    raise exception 'Para publicar use la opción Publicar.';
  end if;
  update public.curriculum_plans set status = p_status where id = p_plan_id
    and (status <> 'publicada' or p_status = 'requiere_actualizacion');
  if not found then raise exception 'No se pudo cambiar el estado.'; end if;
end $$;

-- 7) Restaurar una versión anterior (crea una versión nueva)
create or replace function public.restore_version(p_version_id uuid, p_notes text default null) returns int
language plpgsql security definer set search_path = '' as $$
declare v_ver public.curriculum_versions; v_proj public.projects; v_new int;
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede restaurar versiones.'; end if;
  select * into v_ver from public.curriculum_versions where id = p_version_id;
  if not found then raise exception 'Versión no encontrada.'; end if;
  select * into v_proj from public.projects where id = v_ver.project_id for update;
  perform public.apply_snapshot(v_proj.id, v_ver.snapshot);
  v_new := v_proj.version_no + 1;
  update public.projects set version_no = v_new where id = v_proj.id;
  insert into public.curriculum_versions (project_id, version_no, snapshot, reason, restored_from_version_id, created_by)
  values (v_proj.id, v_new, public.project_snapshot(v_proj.id), 'restauracion', p_version_id, (select auth.uid()));
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'version_restaurada', 'projects', v_proj.id::text,
          jsonb_build_object('desde_version', v_ver.version_no, 'nueva_version', v_new, 'notas', p_notes));
  return v_new;
end $$;

-- 8) Marcar notificaciones como leídas (las propias)
create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
   where recipient_id = (select auth.uid()) and read_at is null and (p_ids is null or id = any(p_ids));
$$;

-- Permisos de ejecución
revoke execute on function public.project_snapshot, public.apply_snapshot, public.notify_admins,
  public.validate_proposal from public, anon, authenticated;
revoke execute on function public.project_context, public.save_change_request, public.submit_change_request,
  public.discard_change_request, public.approve_change_request, public.reject_change_request,
  public.add_request_observation, public.publish_imported_plan, public.set_plan_review_status,
  public.restore_version, public.mark_notifications_read from public, anon;
grant execute on function public.project_context, public.save_change_request, public.submit_change_request,
  public.discard_change_request, public.approve_change_request, public.reject_change_request,
  public.add_request_observation, public.publish_imported_plan, public.set_plan_review_status,
  public.restore_version, public.mark_notifications_read to authenticated;
