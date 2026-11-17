-- =====================================================================
-- MALLAS COMFACOR · Migración 0002 · Funciones de permisos y políticas RLS
-- Regla: nadie escribe directamente en el contenido publicado; los
-- cambios entran por funciones controladas (migración 0003).
-- =====================================================================

-- ¿El usuario actual es administrador activo?
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
                 where p.id = (select auth.uid()) and p.role = 'admin' and p.active);
$$;

-- ¿El usuario actual tiene una cuenta activa?
create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
                 where p.id = (select auth.uid()) and p.active);
$$;

-- ¿Puede el usuario actual proponer cambios en esta área y vigencia?
create or replace function public.can_edit_area(p_area_id uuid, p_year_id uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (
    select 1 from public.teacher_area_assignments a
    join public.profiles p on p.id = a.teacher_id
    where a.teacher_id = (select auth.uid()) and p.active and a.active
      and a.area_id = p_area_id
      and (a.academic_year_id is null or p_year_id is null or a.academic_year_id = p_year_id));
$$;

-- ¿Puede el usuario ver este plan? (publicado para todos; el resto solo admin)
create or replace function public.can_view_plan(p_plan_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (public.is_active_user() and exists (
    select 1 from public.curriculum_plans c
    where c.id = p_plan_id and c.status in ('publicada', 'requiere_actualizacion')));
$$;

revoke execute on function public.is_admin, public.is_active_user, public.can_edit_area, public.can_view_plan from public, anon;
grant execute on function public.is_admin, public.is_active_user, public.can_edit_area, public.can_view_plan to authenticated;

-- Perfil automático al crear un usuario. El primer usuario del sistema es el administrador.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_first boolean;
begin
  select not exists (select 1 from public.profiles where role = 'admin') into v_first;
  insert into public.profiles (id, email, full_name, role, active)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', ''),
          case when v_first then 'admin'::public.app_role else 'docente'::public.app_role end,
          v_first);
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (new.id, 'cuenta_creada', 'profiles', new.id::text,
          jsonb_build_object('email', new.email, 'admin_inicial', v_first));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Fecha de actualización automática
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create trigger t_profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger t_plans_touch    before update on public.curriculum_plans for each row execute function public.touch_updated_at();
create trigger t_projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger t_rows_touch     before update on public.curriculum_rows for each row execute function public.touch_updated_at();
create trigger t_cr_touch       before update on public.change_requests for each row execute function public.touch_updated_at();

-- Auditoría automática de cambios en cuentas y asignaciones
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), lower(tg_op), tg_table_name,
          coalesce((case when tg_op = 'DELETE' then old.id else new.id end)::text, ''),
          jsonb_build_object('antes', case when tg_op <> 'INSERT' then to_jsonb(old) end,
                             'despues', case when tg_op <> 'DELETE' then to_jsonb(new) end));
  return coalesce(new, old);
end $$;

create trigger t_audit_profiles after update or delete on public.profiles
  for each row execute function public.audit_row_change();
create trigger t_audit_assign after insert or update or delete on public.teacher_area_assignments
  for each row execute function public.audit_row_change();
create trigger t_audit_years after insert or update or delete on public.academic_years
  for each row execute function public.audit_row_change();

-- Un administrador no puede quitarse a sí mismo el rol ni desactivarse (evita quedar sin acceso)
create or replace function public.protect_self_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.id = (select auth.uid()) and old.role = 'admin' and (new.role <> 'admin' or not new.active) then
    raise exception 'No puede quitarse a sí mismo el rol de administrador ni desactivar su propia cuenta.';
  end if;
  if new.email <> old.email then new.email = old.email; end if;
  return new;
end $$;
create trigger t_protect_self_admin before update on public.profiles
  for each row execute function public.protect_self_admin();

-- ---------- Activar RLS en todas las tablas ----------
alter table public.profiles                 enable row level security;
alter table public.areas                    enable row level security;
alter table public.subjects                 enable row level security;
alter table public.grades                   enable row level security;
alter table public.periods                  enable row level security;
alter table public.academic_years           enable row level security;
alter table public.teacher_area_assignments enable row level security;
alter table public.institution_settings     enable row level security;
alter table public.curriculum_plans         enable row level security;
alter table public.projects                 enable row level security;
alter table public.project_grades           enable row level security;
alter table public.curriculum_rows          enable row level security;
alter table public.document_sources         enable row level security;
alter table public.import_jobs              enable row level security;
alter table public.change_requests          enable row level security;
alter table public.curriculum_versions      enable row level security;
alter table public.approval_records         enable row level security;
alter table public.notifications            enable row level security;
alter table public.audit_logs               enable row level security;

-- Los usuarios sin sesión no tienen ningún privilegio
revoke all on all tables in schema public from anon;

-- ---------- Políticas ----------
-- Perfiles: usuarios activos ven nombres de colegas; solo el admin modifica
create policy perfiles_ver on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_active_user());
create policy perfiles_admin_editar on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Catálogos: lectura para usuarios activos, escritura solo admin
create policy areas_ver on public.areas for select to authenticated using (public.is_active_user());
create policy areas_admin on public.areas for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy subjects_ver on public.subjects for select to authenticated using (public.is_active_user());
create policy subjects_admin on public.subjects for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy grades_ver on public.grades for select to authenticated using (public.is_active_user());
create policy grades_admin on public.grades for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy periods_ver on public.periods for select to authenticated using (public.is_active_user());
create policy years_ver on public.academic_years for select to authenticated using (public.is_active_user());
create policy years_admin on public.academic_years for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy settings_ver on public.institution_settings for select to authenticated using (public.is_active_user());
create policy settings_admin on public.institution_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Asignaciones: todos los activos ven responsables; solo admin modifica
create policy asign_ver on public.teacher_area_assignments for select to authenticated using (public.is_active_user());
create policy asign_admin on public.teacher_area_assignments for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Contenido: lectura según estado del plan; escritura directa solo admin y solo si NO está publicado
create policy planes_ver on public.curriculum_plans for select to authenticated using (public.can_view_plan(id));
create policy proyectos_ver on public.projects for select to authenticated using (public.can_view_plan(plan_id));
create policy proyectos_admin_borrador on public.projects for update to authenticated
  using (public.is_admin() and exists (select 1 from public.curriculum_plans c where c.id = plan_id and c.status not in ('publicada','requiere_actualizacion')))
  with check (public.is_admin());
create policy pgrados_ver on public.project_grades for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and public.can_view_plan(p.plan_id)));
create policy filas_ver on public.curriculum_rows for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and public.can_view_plan(p.plan_id)));
create policy filas_admin_borrador on public.curriculum_rows for all to authenticated
  using (public.is_admin() and exists (select 1 from public.projects p join public.curriculum_plans c on c.id = p.plan_id
         where p.id = project_id and c.status not in ('publicada','requiere_actualizacion')))
  with check (public.is_admin() and exists (select 1 from public.projects p join public.curriculum_plans c on c.id = p.plan_id
         where p.id = project_id and c.status not in ('publicada','requiere_actualizacion')));

-- Importación: solo administrador
create policy fuentes_admin on public.document_sources for select to authenticated using (public.is_admin());
create policy importaciones_admin on public.import_jobs for select to authenticated using (public.is_admin());

-- Solicitudes: el docente ve las suyas; el admin todas. Se escriben solo con funciones.
create policy solicitudes_ver on public.change_requests for select to authenticated
  using (requested_by = (select auth.uid()) or public.is_admin());

-- Historial: admin todo; docente solo de sus áreas
create policy versiones_ver on public.curriculum_versions for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.projects p join public.curriculum_plans c on c.id = p.plan_id
    where p.id = project_id and public.can_edit_area(c.area_id, c.academic_year_id)));
create policy aprobaciones_ver on public.approval_records for select to authenticated
  using (public.is_admin() or exists (select 1 from public.change_requests r
         where r.id = change_request_id and r.requested_by = (select auth.uid())));

-- Notificaciones: cada uno las suyas (se marcan como leídas con función)
create policy notif_ver on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));

-- Auditoría: solo admin
create policy auditoria_ver on public.audit_logs for select to authenticated using (public.is_admin());

-- Privilegios: quitar escritura directa donde no hay política de escritura
revoke insert, update, delete on public.change_requests, public.curriculum_versions, public.approval_records,
  public.notifications, public.audit_logs, public.document_sources, public.import_jobs, public.curriculum_plans,
  public.periods from authenticated;
revoke insert, delete on public.projects, public.profiles from authenticated;
