-- =====================================================================
-- MALLAS COMFACOR · Migración 0006 · Cargar una importación (solo administrador)
-- Recibe el JSON producido por scripts/import/importar_docx.py y lo deja
-- en estado 'importada' (NO publicada) para revisión del administrador.
-- =====================================================================
create or replace function public.import_plan(p_area_slug text, p_year int, d jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_area uuid; v_year uuid; v_src uuid; v_plan uuid; v_proj uuid; p jsonb; r jsonb; i int; v_err boolean;
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede cargar importaciones.'; end if;
  select id into v_area from public.areas where slug = p_area_slug;
  select id into v_year from public.academic_years where year = p_year;
  if v_area is null or v_year is null then raise exception 'Área o vigencia no encontrada.'; end if;
  if exists (select 1 from public.document_sources where sha256 = d->>'sha256') then
    raise exception 'Este documento ya fue importado antes (mismo archivo).';
  end if;
  if exists (select 1 from public.curriculum_plans where area_id = v_area and academic_year_id = v_year and subject_id is null) then
    raise exception 'Ya existe una malla de esta área para la vigencia %.', p_year;
  end if;

  insert into public.document_sources (area_id, academic_year_id, file_name, sha256, size_bytes, file_modified_at, uploaded_by)
  values (v_area, v_year, d->>'file_name', d->>'sha256', (d->>'size_bytes')::bigint,
          (d->>'file_modified_at')::timestamptz, (select auth.uid()))
  returning id into v_src;

  insert into public.curriculum_plans (area_id, academic_year_id, status, general_info)
  values (v_area, v_year, 'importada', coalesce(d->'general_info', '[]'::jsonb)) returning id into v_plan;

  for p in select value from jsonb_array_elements(d->'projects') loop
    insert into public.projects (plan_id, grade_id, period_id, label, number_text, name, purpose_label, purpose, header_fields, columns)
    values (v_plan,
            (select id from public.grades where slug = p->>'grade'),
            (select id from public.periods where number = (p->>'period')::int),
            p->>'label', coalesce(p->>'number_text',''), coalesce(p->>'name',''), coalesce(p->>'purpose_label','Propósito'),
            coalesce(p->>'purpose',''), coalesce(p->'header_fields','[]'::jsonb), p->'columns')
    returning id into v_proj;
    i := 0;
    for r in select value from jsonb_array_elements(p->'rows') loop
      i := i + 1;
      insert into public.curriculum_rows (project_id, position, cells) values (v_proj, i, r);
    end loop;
  end loop;

  select exists (select 1 from jsonb_array_elements(d->'alerts') a where a->>'nivel' = 'error') into v_err;
  insert into public.import_jobs (document_source_id, plan_id, status, summary, alerts, importer_version, finished_at)
  values (v_src, v_plan, (case when v_err then 'con_alertas' else 'procesado' end)::public.import_status,
          coalesce(d->'summary','{}'::jsonb), coalesce(d->'alerts','[]'::jsonb), d->>'importer_version', now());
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'importacion_cargada', 'curriculum_plans', v_plan::text,
          jsonb_build_object('archivo', d->>'file_name', 'proyectos', jsonb_array_length(d->'projects')));
  return v_plan;
end $$;

revoke execute on function public.import_plan from public, anon;
grant execute on function public.import_plan to authenticated;

-- El administrador puede subir los documentos originales a la carpeta privada
create policy originales_admin_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'originales' and public.is_admin());
