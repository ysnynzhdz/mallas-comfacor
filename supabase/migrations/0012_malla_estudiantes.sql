-- MALLAS COMFACOR · Migración 0012 · Formato de la malla para estudiantes
-- Textos del encabezado y nota de la versión para estudiantes (editables por el administrador).
-- Valores iniciales tomados del formato institucional entregado por el usuario (vigencia 2026).
alter table public.institution_settings add column if not exists student_sheet jsonb not null default jsonb_build_object(
  'titulo', 'INSTITUCIÓN EDUCATIVA COMFACOR “JAIME EXBRAYAT”',
  'lema_anio', '2026 AÑO DEL AUTOCONOCIMIENTO A LA EMPATÍA Y DE LA EMPATÍA A LA TRANSFORMACIÓN DEL MUNDO.',
  'lema', 'Lema: “esfuerzo, trabajo y fe”',
  'subtitulo', 'PLAN DE CLASE CON ENFOQUE DUA',
  'documento', 'MALLA DE APRENDIZAJE',
  'ciudad', 'Montería',
  'nota', 'NOTA: la malla se debe entregar en físico a los estudiantes (al inicio de cada período académico) para que la peguen en su cuaderno, además hay que “subirla” en la Plataforma EDI de Santillana.'
);
insert into public.institution_settings (id) values (true) on conflict (id) do nothing;
