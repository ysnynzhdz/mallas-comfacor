export type Role = "admin" | "docente";
export type PlanStatus =
  | "sin_importar" | "importada" | "en_revision" | "pendiente_aprobacion" | "publicada" | "requiere_actualizacion";
export type RequestStatus = "borrador" | "pendiente" | "aprobado" | "rechazado";

export type Profile = { id: string; full_name: string; email: string; role: Role; active: boolean };
export type Area = { id: string; slug: string; name: string; color: string; sort_order: number; active: boolean };
export type Grade = { id: string; slug: string; name: string; short_name: string; level: string; sort_order: number };
export type Period = { id: string; number: number; name: string };
export type AcademicYear = { id: string; year: number; status: "borrador" | "vigente" | "archivada" };

export type Column = { key: string; label: string; category: string; group?: string };
export type HeaderField = { label: string; value: string };
/** Celdas de una fila: texto por columna + metadatos de celdas combinadas. */
export type Cells = Record<string, string> & {
  _span?: Record<string, number>;
  _colspan?: Record<string, number>;
};
export type RowSnap = { id?: string; cells: Cells; origin_row_id?: string | null };

export type Snapshot = {
  label: string;
  number_text: string;
  name: string;
  purpose_label: string;
  purpose: string;
  header_fields: HeaderField[];
  columns: Column[];
  rows: RowSnap[];
};

export type Project = {
  id: string;
  plan_id: string;
  grade_id: string;
  period_id: string;
  subject_id: string | null;
  name_is_proposed: boolean;
  label: string;
  number_text: string;
  name: string;
  purpose_label: string;
  purpose: string;
  header_fields: HeaderField[];
  columns: Column[];
  version_no: number;
  updated_at: string;
};

export type Plan = {
  id: string;
  area_id: string;
  subject_id: string | null;
  academic_year_id: string;
  status: PlanStatus;
  general_info: GeneralBlock[];
  last_published_at: string | null;
  updated_at: string;
};

export type GeneralBlock =
  | { type: "p"; text: string }
  | { type: "note"; text: string }
  | { type: "table" | "table_dump"; title?: string; rows: string[][] };

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  sin_importar: "Sin importar",
  importada: "Importada",
  en_revision: "En revisión",
  pendiente_aprobacion: "Pendiente de aprobación",
  publicada: "Publicada",
  requiere_actualizacion: "Requiere actualización",
};

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  borrador: "Borrador",
  pendiente: "Pendiente de aprobación",
  aprobado: "Aprobada",
  rechazado: "Rechazada",
};

export type Subject = { id: string; area_id: string; name: string; sort_order: number };
