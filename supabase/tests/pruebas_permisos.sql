-- MALLAS COMFACOR · Pruebas automáticas de permisos y flujo de aprobación.
-- Todo ocurre dentro de una transacción que se deshace al final (no deja datos).
-- El resultado aparece como mensaje de error "RESULTADOS: ...".
do $t$
declare
  adm uuid := gen_random_uuid(); d1 uuid := gen_random_uuid(); d2 uuid := gen_random_uuid(); d3 uuid := gen_random_uuid();
  v_area uuid; v_year uuid; v_plan uuid; v_proj uuid; v_row uuid; v_req uuid; v_req2 uuid; n int; ok text := ''; res text := '';
  snap jsonb; v_ver uuid;
  procedure_dummy int;
begin
  -- Usuarios de prueba (el primero se vuelve administrador)
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values (adm, 'adm@prueba.test', 'authenticated', 'authenticated', '{"full_name":"Admin Prueba"}');
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values (d1, 'd1@prueba.test', 'authenticated', 'authenticated', '{"full_name":"Docente Uno"}');
  insert into auth.users (id, email, aud, role) values (d2, 'd2@prueba.test', 'authenticated', 'authenticated');
  insert into auth.users (id, email, aud, role) values (d3, 'd3@prueba.test', 'authenticated', 'authenticated');
  select role::text || '/' || active into ok from public.profiles where id = adm; res := res || '1 primer usuario=' || ok || ' (esperado admin/true); ';
  select role::text || '/' || active into ok from public.profiles where id = d1; res := res || '2 cuenta nueva=' || ok || ' (esperado docente/false); ';
  update public.profiles set active = true where id in (d1, d2);
  select id into v_area from public.areas where slug = 'filosofia';
  select id into v_year from public.academic_years where year = 2024;
  insert into public.teacher_area_assignments (teacher_id, area_id) values (d1, v_area);
  insert into public.curriculum_plans (area_id, academic_year_id, status) values (v_area, v_year, 'importada') returning id into v_plan;
  insert into public.projects (plan_id, grade_id, period_id, name, columns)
    values (v_plan, (select id from public.grades where slug='noveno'), (select id from public.periods where number=1), 'Unidad prueba',
            '[{"key":"c1","label":"APRENDIZAJES","category":"aprendizaje"}]') returning id into v_proj;
  insert into public.curriculum_rows (project_id, position, cells) values (v_proj, 1, '{"c1":"Texto original"}') returning id into v_row;

  -- Docente no ve mallas sin publicar
  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.projects where id = v_proj; res := res || '3 docente ve importada=' || n || ' (esperado 0); ';
  execute 'reset role';

  -- Admin publica
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.publish_imported_plan(v_plan, null);
  execute 'reset role';
  select version_no into n from public.projects where id = v_proj; res := res || '4 version tras publicar=' || n || ' (esperado 1); ';

  -- Docente asignado: ve, propone y envía
  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.curriculum_rows where project_id = v_proj; res := res || '5 docente ve filas publicadas=' || n || ' (esperado 1); ';
  snap := jsonb_build_object('label','Unidad','number_text','1','name','Unidad prueba EDITADA','purpose_label','Propósito','purpose','',
            'header_fields','[]'::jsonb,'columns','[{"key":"c1","label":"APRENDIZAJES","category":"aprendizaje"}]'::jsonb,
            'rows', jsonb_build_array(jsonb_build_object('id', v_row, 'cells', '{"c1":"Texto modificado"}'::jsonb), jsonb_build_object('cells','{"c1":"Fila nueva"}'::jsonb)));
  v_req := public.save_change_request(v_proj, snap, 'prueba', null);
  perform public.submit_change_request(v_req);
  select name into ok from public.projects where id = v_proj; res := res || '6 publicada sigue igual=' || ok || '; ';
  begin perform public.approve_change_request(v_req, null, false); res := res || '7 docente aprueba=PERMITIDO (MAL); ';
  exception when others then res := res || '7 docente aprueba=bloqueado (bien); '; end;
  begin insert into public.curriculum_rows (project_id, position, cells) values (v_proj, 9, '{}'); res := res || '8 insert directo=PERMITIDO (MAL); ';
  exception when others then res := res || '8 insert directo=bloqueado (bien); '; end;
  update public.projects set name = 'hack' where id = v_proj; get diagnostics n = row_count; res := res || '9 update directo filas=' || n || ' (esperado 0); ';
  begin update public.change_requests set status = 'aprobado' where id = v_req; res := res || '10 cambiar estado directo=PERMITIDO (MAL); ';
  exception when others then res := res || '10 cambiar estado directo=bloqueado (bien); '; end;
  begin update public.profiles set role = 'admin' where id = d1; get diagnostics n = row_count; res := res || '11 auto-ascenso filas=' || n || ' (esperado 0); ';
  exception when others then res := res || '11 auto-ascenso=bloqueado (bien); '; end;
  execute 'reset role';

  -- Docente NO asignado
  perform set_config('request.jwt.claims', json_build_object('sub', d2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.projects where id = v_proj; res := res || '12 no asignado consulta=' || n || ' (esperado 1); ';
  begin perform public.save_change_request(v_proj, snap, '', null); res := res || '13 no asignado propone=PERMITIDO (MAL); ';
  exception when others then res := res || '13 no asignado propone=bloqueado (bien); '; end;
  select count(*) into n from public.change_requests; res := res || '14 no asignado ve solicitudes ajenas=' || n || ' (esperado 0); ';
  execute 'reset role';

  -- Cuenta inactiva y sin sesión
  perform set_config('request.jwt.claims', json_build_object('sub', d3, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.areas; res := res || '15 inactiva ve áreas=' || n || ' (esperado 0); ';
  execute 'reset role';
  execute 'set local role anon';
  begin select count(*) into n from public.areas; res := res || '16 sin sesión ve áreas=' || n || ' (MAL); ';
  exception when others then res := res || '16 sin sesión=bloqueado (bien); '; end;
  execute 'reset role';

  -- Admin aprueba
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.approve_change_request(v_req, 'Bien', false);
  execute 'reset role';
  select version_no || '/' || name into ok from public.projects where id = v_proj; res := res || '17 tras aprobar=' || ok || ' (esperado 2/...EDITADA); ';
  select count(*) into n from public.curriculum_rows where project_id = v_proj; res := res || '18 filas=' || n || ' (esperado 2); ';
  select count(*) into n from public.curriculum_versions where project_id = v_proj; res := res || '19 versiones guardadas=' || n || ' (esperado 2); ';
  select count(*) into n from public.notifications where recipient_id = d1 and type = 'solicitud_aprobada'; res := res || '20 aviso al docente=' || n || ' (esperado 1); ';
  select count(*) into n from public.notifications where recipient_id = adm and type = 'solicitud_recibida'; res := res || '21 aviso al admin=' || n || ' (esperado 1); ';

  -- Rechazo y reenvío
  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_req2 := public.save_change_request(v_proj, snap || '{"name":"Otra propuesta"}', '', null);
  perform public.submit_change_request(v_req2);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.reject_change_request(v_req2, ''); res := res || '22 rechazo sin motivo=PERMITIDO (MAL); ';
  exception when others then res := res || '22 rechazo sin motivo=bloqueado (bien); '; end;
  perform public.reject_change_request(v_req2, 'Falta justificar');
  execute 'reset role';
  select name into ok from public.projects where id = v_proj; res := res || '23 tras rechazo publicada=' || ok || '; ';
  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.save_change_request(v_proj, snap || '{"name":"Corregida"}', 'corregí', v_req2);
  perform public.submit_change_request(v_req2);
  select status::text into ok from public.change_requests where id = v_req2; res := res || '24 reenviada=' || ok || ' (esperado pendiente); ';
  execute 'reset role';

  -- Restaurar versión 1
  select id into v_ver from public.curriculum_versions where project_id = v_proj and version_no = 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.restore_version(v_ver, null);
  execute 'reset role';
  select version_no || '/' || name into ok from public.projects where id = v_proj; res := res || '25 tras restaurar=' || ok || ' (esperado 3/Unidad prueba); ';
  select count(*) into n from public.curriculum_versions where project_id = v_proj; res := res || '26 versiones=' || n || ' (esperado 3, nada borrado); ';
  -- Aprobar la reenviada ahora debe avisar conflicto
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.approve_change_request(v_req2, null, false); res := res || '27 conflicto=NO DETECTADO (MAL); ';
  exception when others then res := res || '27 conflicto=detectado (bien); '; end;
  execute 'reset role';

  raise exception 'RESULTADOS: %', res;
end $t$;
