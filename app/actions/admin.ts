"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { adminClientOrNull } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { IMPORTACIONES } from "@/lib/importaciones";

export type ActionState = { error?: string; ok?: string };
const friendly = (m: string) => m.replace(/^.*?ERROR:\s*/, "");

export async function decidirSolicitud(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision"));
  const notes = String(formData.get("notes") ?? "").trim();
  const supabase = await createClient();
  let error;
  if (decision === "aprobar") {
    ({ error } = await supabase.rpc("approve_change_request", {
      p_request_id: id,
      p_notes: notes || null,
      p_force: formData.get("forzar") === "1",
    }));
  } else if (decision === "rechazar") {
    if (!notes) return { error: "Escriba el motivo del rechazo para que el docente sepa qué corregir." };
    ({ error } = await supabase.rpc("reject_change_request", { p_request_id: id, p_notes: notes }));
  } else {
    if (!notes) return { error: "La observación está vacía." };
    ({ error } = await supabase.rpc("add_request_observation", { p_request_id: id, p_notes: notes }));
    if (!error) {
      revalidatePath(`/admin/solicitudes/${id}`);
      return { ok: "Observación enviada al docente." };
    }
  }
  if (error) return { error: friendly(error.message) };
  revalidatePath("/", "layout");
  redirect(`/admin/solicitudes?hecho=${decision}`);
}

export async function restaurarVersion(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_version", { p_version_id: String(formData.get("versionId")), p_notes: null });
  const back = String(formData.get("backTo"));
  revalidatePath("/", "layout");
  redirect(`${back}${back.includes("?") ? "&" : "?"}${error ? "error=" + encodeURIComponent(friendly(error.message)) : "restaurada=1"}`);
}

export async function cargarImportacion(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const file = String(formData.get("archivo"));
  const k = IMPORTACIONES.find((x) => x.id === file);
  if (!k) return { error: "Archivo de importación no reconocido." };
  const reemplazar = formData.get("reemplazar") === "1";
  const supabase = await createClient();
  const d = (await import(`@/data/importaciones/${k.id}.json`)).default;
  const { data, error } = await supabase.rpc("import_plan", { p_area_slug: k.area, p_year: k.year, d, p_replace: reemplazar });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/", "layout");
  redirect(`/admin/importaciones/${data}`);
}

export async function publicarImportacion(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const planId = String(formData.get("planId"));
  if (formData.get("confirmo") !== "1") return { error: "Marque la casilla para confirmar que revisó la malla." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_imported_plan", { p_plan_id: planId, p_notes: String(formData.get("notes") ?? "") || null });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/", "layout");
  redirect(`/admin/importaciones/${planId}?publicada=1`);
}

export async function cambiarEstadoRevision(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.rpc("set_plan_review_status", { p_plan_id: String(formData.get("planId")), p_status: String(formData.get("status")) });
  revalidatePath("/", "layout");
}

// ---------- Docentes ----------
export async function actualizarDocente(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = String(formData.get("id"));
  const full_name = String(formData.get("full_name") ?? "").trim().slice(0, 150);
  const role = formData.get("role") === "admin" ? "admin" : "docente";
  const active = formData.get("active") === "1";
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name, role, active }).eq("id", id);
  if (error) return { error: friendly(error.message) };
  // Áreas asignadas: se activan las marcadas y se desactivan las demás (no se borra el registro)
  const wanted = new Set(formData.getAll("areas").map(String));
  const grades = String(formData.get("grades_attended") ?? "").slice(0, 200);
  const { data: current } = await supabase.from("teacher_area_assignments").select("id, area_id, active").eq("teacher_id", id).is("academic_year_id", null);
  for (const a of current ?? []) {
    const should = wanted.has(a.area_id);
    await supabase.from("teacher_area_assignments").update({ active: should, grades_attended: grades }).eq("id", a.id);
    wanted.delete(a.area_id);
  }
  for (const areaId of wanted) {
    const { error: e2 } = await supabase
      .from("teacher_area_assignments")
      .insert({ teacher_id: id, area_id: areaId, academic_year_id: null, grades_attended: grades, active: true });
    if (e2) return { error: friendly(e2.message) };
  }
  revalidatePath("/admin/docentes");
  return { ok: "Cambios guardados." };
}

function tempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export async function crearDocente(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const admin = adminClientOrNull();
  if (!admin) return { error: "Falta configurar la clave secreta de Supabase en Vercel (ver instrucciones en esta página)." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !full_name) return { error: "Escriba un nombre y un correo válidos." };
  const password = tempPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, must_change_password: true },
  });
  if (error) return { error: error.message.includes("already") ? "Ya existe una cuenta con ese correo." : error.message };
  const supabase = await createClient();
  await supabase.from("profiles").update({ active: true, full_name }).eq("id", data.user.id);
  revalidatePath("/admin/docentes");
  return {
    ok: `Cuenta creada para ${full_name}. Contraseña temporal: ${password} — entréguela personalmente; el sistema le pedirá cambiarla al ingresar. No se volverá a mostrar.`,
  };
}

export async function restablecerClave(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const admin = adminClientOrNull();
  if (!admin) return { error: "Falta configurar la clave secreta de Supabase en Vercel." };
  const id = String(formData.get("id"));
  const password = tempPassword();
  const { error } = await admin.auth.admin.updateUserById(id, { password, user_metadata: { must_change_password: true } });
  if (error) return { error: error.message };
  return { ok: `Nueva contraseña temporal: ${password} — entréguela personalmente. No se volverá a mostrar.` };
}

// ---------- Vigencias ----------
export async function duplicarVigencia(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const desde = Number(formData.get("desde"));
  const hasta = Number(formData.get("hasta"));
  if (!Number.isInteger(hasta) || hasta < 2000 || hasta > 2100) return { error: "Escriba un año válido para la nueva vigencia." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_year", { p_from: desde, p_to: hasta });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/", "layout");
  return { ok: `Listo: se copiaron ${data} área(s) a la vigencia ${hasta} como borrador. Revíselas y publíquelas desde Importaciones.` };
}

export async function activarVigencia(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const year = Number(formData.get("year"));
  if (formData.get("confirmo") !== "1") return { error: "Marque la casilla para confirmar." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_current_year", { p_year: year });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/", "layout");
  return { ok: `La vigencia ${year} quedó como vigente.` };
}
