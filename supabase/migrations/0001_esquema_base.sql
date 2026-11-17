-- =====================================================================
-- MALLAS COMFACOR · Migración 0001 · Esquema base
-- Catálogos, usuarios, contenido curricular, importación, solicitudes,
-- versiones, aprobaciones, notificaciones y auditoría.
-- =====================================================================

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Configuración de búsqueda en español que ignora tildes
create text search configuration public.es_unaccent (copy = pg_catalog.spanish);
alter text search configuration public.es_unaccent
  alter mapping for hword, hword_part, word with extensions.unaccent, spanish_stem;

-- ---------- Tipos ----------
create type public.app_role       as enum ('admin', 'docente');
create type public.grade_level    as enum ('preescolar', 'primaria', 'secundaria', 'media');
create type public.year_status    as enum ('borrador', 'vigente', 'archivada');
create type public.plan_status    as enum ('sin_importar', 'importada', 'en_revision',
                                           'pendiente_aprobacion', 'publicada', 'requiere_actualizacion');
create type public.request_status as enum ('borrador', 'pendiente', 'aprobado', 'rechazado');
create type public.version_reason as enum ('importacion', 'aprobacion', 'restauracion', 'duplicacion');
create type public.import_status  as enum ('pendiente', 'procesado', 'con_alertas', 'aprobado', 'descartado');
create type public.approval_action as enum ('aprobado', 'rechazado', 'observacion', 'importacion_aprobada');

-- ---------- Usuarios ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text not null,
  role        public.app_role not null default 'docente',
  active      boolean not null default false,  -- una cuenta nueva no ve nada hasta que el administrador la activa
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Catálogos ----------
create table public.areas (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null unique,
  color       text not null default '#1E3A8A',
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  area_id     uuid not null references public.areas(id) on delete restrict,
  name        text not null,
  sort_order  int  not null default 0,
  unique (area_id, name)
);

create table public.grades (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null unique,
  short_name  text not null,
  level       public.grade_level not null,
  sort_order  int  not null unique
);

create table public.periods (
  id          uuid primary key default gen_random_uuid(),
  number      int  not null unique check (number between 1 and 3),
  name        text not null
);

create table public.academic_years (
  id            uuid primary key default gen_random_uuid(),
  year          int  not null unique check (year between 2000 and 2100),
  status        public.year_status not null default 'borrador',
  copied_from   uuid references public.academic_years(id),
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);

create table public.teacher_area_assignments (
  id                uuid primary key default gen_random_uuid(),
  teacher_id        uuid not null references public.profiles(id) on delete cascade,
  area_id           uuid not null references public.areas(id) on delete restrict,
  academic_year_id  uuid references public.academic_years(id) on delete restrict, -- null = todas las vigencias
  grades_attended   text not null default '',
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (teacher_id, area_id, academic_year_id)
);
create index on public.teacher_area_assignments (area_id);

create table public.institution_settings (
  id              boolean primary key default true check (id),  -- una sola fila
  name            text not null default 'Institución Educativa COMFACOR Jaime Exbrayat',
  city            text not null default 'Montería, Córdoba',
  logo_path       text,
  primary_color   text not null default '#1E3A8A',
  accent_color    text not null default '#15803D',
  document_header text not null default 'MALLAS CURRICULARES',
  updated_at      timestamptz not null default now()
);

-- ---------- Contenido curricular ----------
create table public.curriculum_plans (
  id                 uuid primary key default gen_random_uuid(),
  area_id            uuid not null references public.areas(id) on delete restrict,
  subject_id         uuid references public.subjects(id) on delete restrict,
  academic_year_id   uuid not null references public.academic_years(id) on delete restrict,
  status             public.plan_status not null default 'sin_importar',
  general_info       jsonb not null default '[]'::jsonb,  -- [{title, text}] contenido fuera de las tablas
  last_published_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index curriculum_plans_unq
  on public.curriculum_plans (area_id, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid), academic_year_id);

create table public.projects (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references public.curriculum_plans(id) on delete cascade,
  grade_id       uuid not null references public.grades(id) on delete restrict,
  period_id      uuid not null references public.periods(id) on delete restrict,
  label          text not null default 'Proyecto',      -- "Proyecto" o "Unidad", como en el documento
  number_text    text not null default '',
  name           text not null default '',
  purpose_label  text not null default 'Propósito',     -- "Propósito" u "Objetivo de aprendizaje"
  purpose        text not null default '',
  header_fields  jsonb not null default '[]'::jsonb,    -- [{label, value}]
  columns        jsonb not null default '[]'::jsonb,    -- [{key, label, category}]
  version_no     int  not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (plan_id, grade_id, period_id)
);
create index on public.projects (grade_id);

-- Grados adicionales que comparten la misma malla (ej. Lengua 10° y 11°)
create table public.project_grades (
  project_id  uuid not null references public.projects(id) on delete cascade,
  grade_id    uuid not null references public.grades(id) on delete restrict,
  primary key (project_id, grade_id)
);

create table public.curriculum_rows (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  position       int  not null,
  cells          jsonb not null default '{}'::jsonb,  -- {clave_columna: texto}
  origin_row_id  uuid,                                -- fila de la vigencia anterior (para comparar)
  search_tsv     tsvector generated always as
                   (jsonb_to_tsvector('public.es_unaccent'::regconfig, cells, '["string"]')) stored,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.curriculum_rows (project_id, position);
create index on public.curriculum_rows using gin (search_tsv);
create index on public.curriculum_rows (origin_row_id);

-- ---------- Importación ----------
create table public.document_sources (
  id                uuid primary key default gen_random_uuid(),
  area_id           uuid not null references public.areas(id) on delete restrict,
  academic_year_id  uuid not null references public.academic_years(id) on delete restrict,
  file_name         text not null,
  storage_path      text,
  sha256            text not null unique,  -- detecta documentos duplicados
  size_bytes        bigint,
  file_modified_at  timestamptz,
  uploaded_by       uuid references public.profiles(id),
  created_at        timestamptz not null default now()
);

create table public.import_jobs (
  id                  uuid primary key default gen_random_uuid(),
  document_source_id  uuid not null references public.document_sources(id) on delete restrict,
  plan_id             uuid references public.curriculum_plans(id) on delete set null,
  status              public.import_status not null default 'pendiente',
  summary             jsonb not null default '{}'::jsonb,
  alerts              jsonb not null default '[]'::jsonb,   -- [{nivel, ubicacion, mensaje}]
  importer_version    text,
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  reviewed_by         uuid references public.profiles(id),
  approved_at         timestamptz
);

-- ---------- Solicitudes, versiones y aprobaciones ----------
create table public.change_requests (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete restrict,
  requested_by     uuid not null references public.profiles(id),
  status           public.request_status not null default 'borrador',
  base_version_no  int  not null,
  proposed         jsonb not null,           -- fotografía completa propuesta
  summary          text not null default '',
  submitted_at     timestamptz,
  decided_by       uuid references public.profiles(id),
  decided_at       timestamptz,
  reviewer_notes   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.change_requests (project_id);
create index on public.change_requests (requested_by);
create index on public.change_requests (status);

create table public.curriculum_versions (
  id                        uuid primary key default gen_random_uuid(),
  project_id                uuid not null references public.projects(id) on delete restrict,
  version_no                int  not null,
  snapshot                  jsonb not null,
  reason                    public.version_reason not null,
  change_request_id         uuid references public.change_requests(id),
  restored_from_version_id  uuid references public.curriculum_versions(id),
  created_by                uuid references public.profiles(id),
  created_at                timestamptz not null default now(),
  unique (project_id, version_no)
);

create table public.approval_records (
  id                 uuid primary key default gen_random_uuid(),
  change_request_id  uuid references public.change_requests(id),
  import_job_id      uuid references public.import_jobs(id),
  action             public.approval_action not null,
  actor_id           uuid not null references public.profiles(id),
  notes              text,
  created_at         timestamptz not null default now(),
  check (change_request_id is not null or import_job_id is not null)
);
create index on public.approval_records (change_request_id);

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  type          text not null,
  area_id       uuid references public.areas(id),
  title         text not null,
  body          text not null default '',
  link          text,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index on public.notifications (recipient_id, read_at);

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,
  entity      text not null,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index on public.audit_logs (created_at desc);
