-- =====================================================================
-- MALLAS COMFACOR · Migración 0004 · Datos iniciales (catálogos)
-- =====================================================================
insert into public.areas (slug, name, color, sort_order) values
 ('ingles','Inglés','#2563EB',1),
 ('ciencias-naturales','Ciencias Naturales','#16A34A',2),
 ('ciencias-sociales','Ciencias Sociales','#B45309',3),
 ('catedra-de-la-paz','Cátedra de la Paz','#0891B2',4),
 ('artistica','Artística','#DB2777',5),
 ('educacion-fisica','Educación Física','#EA580C',6),
 ('lengua-castellana','Lengua Castellana','#DC2626',7),
 ('historia-de-colombia','Historia de Colombia','#A16207',8),
 ('matematicas','Matemáticas','#1D4ED8',9),
 ('emprendimiento','Emprendimiento','#7C3AED',10),
 ('ciencias-economicas-y-politicas','Ciencias Económicas y Políticas','#4F46E5',11),
 ('filosofia','Filosofía','#475569',12),
 ('etica-y-valores','Ética y Valores','#0D9488',13),
 ('religion','Religión','#9333EA',14),
 ('tecnologia-e-informatica','Tecnología e Informática','#0284C7',15);

insert into public.subjects (area_id, name, sort_order)
select id, s.name, s.ord from public.areas, (values ('Biología',1),('Química',2),('Física',3)) s(name, ord)
where slug = 'ciencias-naturales';

insert into public.grades (slug, name, short_name, level, sort_order) values
 ('prejardin','Prejardín','PJ','preescolar',1),
 ('jardin','Jardín','J','preescolar',2),
 ('transicion','Transición','T','preescolar',3),
 ('primero','Primero','1°','primaria',4),
 ('segundo','Segundo','2°','primaria',5),
 ('tercero','Tercero','3°','primaria',6),
 ('cuarto','Cuarto','4°','primaria',7),
 ('quinto','Quinto','5°','primaria',8),
 ('sexto','Sexto','6°','secundaria',9),
 ('septimo','Séptimo','7°','secundaria',10),
 ('octavo','Octavo','8°','secundaria',11),
 ('noveno','Noveno','9°','secundaria',12),
 ('decimo','Décimo','10°','media',13),
 ('undecimo','Undécimo','11°','media',14);

insert into public.periods (number, name) values (1,'Período 1'),(2,'Período 2'),(3,'Período 3');

-- Decisión 5: los documentos originales se cargan como vigencia 2024; 2026 se creará duplicándola.
insert into public.academic_years (year, status) values (2024, 'vigente');

insert into public.institution_settings (id) values (true);

-- Carpeta privada para los documentos originales (solo administrador)
insert into storage.buckets (id, name, public) values ('originales', 'originales', false)
on conflict (id) do nothing;
create policy originales_admin_leer on storage.objects for select to authenticated
  using (bucket_id = 'originales' and public.is_admin());
