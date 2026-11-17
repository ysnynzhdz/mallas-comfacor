"""Genera el SQL que carga un JSON del importador como malla en estado 'importada' (no publicada).
Uso: python3 -I generar_sql.py <json> <slug_area> <año> <salida.sql>"""
import sys, json
d = json.load(open(sys.argv[1], encoding="utf-8"))
area, year, out = sys.argv[2], int(sys.argv[3]), sys.argv[4]
payload = json.dumps(d, ensure_ascii=False)
assert "$IMP$" not in payload
sql = f"""
do $do$
declare
  d jsonb := $IMP${payload}$IMP$::jsonb;
  v_area uuid; v_year uuid; v_src uuid; v_plan uuid; v_job uuid; v_proj uuid; p jsonb; r jsonb; i int;
  has_alert_error boolean;
begin
  select id into v_area from public.areas where slug = '{area}';
  select id into v_year from public.academic_years where year = {year};
  if v_area is null or v_year is null then raise exception 'Área o vigencia no encontrada'; end if;

  insert into public.document_sources (area_id, academic_year_id, file_name, sha256, size_bytes, file_modified_at)
  values (v_area, v_year, d->>'file_name', d->>'sha256', (d->>'size_bytes')::bigint, (d->>'file_modified_at')::timestamptz)
  returning id into v_src;

  insert into public.curriculum_plans (area_id, academic_year_id, status, general_info)
  values (v_area, v_year, 'importada', d->'general_info') returning id into v_plan;

  for p in select value from jsonb_array_elements(d->'projects') loop
    insert into public.projects (plan_id, grade_id, period_id, label, number_text, name, purpose_label, purpose, header_fields, columns)
    values (v_plan,
            (select id from public.grades where slug = p->>'grade'),
            (select id from public.periods where number = (p->>'period')::int),
            p->>'label', p->>'number_text', p->>'name', p->>'purpose_label', p->>'purpose', p->'header_fields', p->'columns')
    returning id into v_proj;
    i := 0;
    for r in select value from jsonb_array_elements(p->'rows') loop
      i := i + 1;
      insert into public.curriculum_rows (project_id, position, cells) values (v_proj, i, r);
    end loop;
  end loop;

  select exists (select 1 from jsonb_array_elements(d->'alerts') a where a->>'nivel' = 'error') into has_alert_error;
  insert into public.import_jobs (document_source_id, plan_id, status, summary, alerts, importer_version, finished_at)
  values (v_src, v_plan, case when has_alert_error then 'con_alertas' else 'procesado' end::public.import_status,
          d->'summary', d->'alerts', d->>'importer_version', now());
  insert into public.audit_logs (action, entity, entity_id, details)
  values ('importacion', 'curriculum_plans', v_plan::text, jsonb_build_object('archivo', d->>'file_name', 'proyectos', jsonb_array_length(d->'projects')));
end
$do$;
"""
open(out, "w", encoding="utf-8").write(sql)
print(len(sql))
