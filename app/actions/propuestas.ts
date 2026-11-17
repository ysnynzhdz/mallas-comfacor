"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const snapSchema = z.object({
  label: z.string(),
  number_text: z.string(),
  name: z.string().max(1000),
  purpose_label: z.string(),
  purpose: z.string().max(20000),
  header_fields: z.array(z.object({ label: z.string(), value: z.string().max(20000) })),
  columns: z.array(z.object({ key: z.string(), label: z.string(), category: z.string(), group: z.string().optional() })),
  rows: z
    .array(
      z.object({
        id: z.string().optional(),
        origin_row_id: z.string().nullable().optional(),
        cells: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1, "La tabla debe tener al menos una fila.")
    .max(400),
});

export type EditorState = { error?: string };

function friendly(msg: string) {
  return msg.replace(/^.*?ERROR:\s*/, "");
}

export async function guardarPropuesta(_: EditorState, formData: FormData): Promise<EditorState> {
  const projectId = String(formData.get("projectId"));
  const requestId = String(formData.get("requestId") ?? "") || null;
  const backTo = String(formData.get("backTo") ?? "/mis-solicitudes");
  const enviar = formData.get("accion") === "enviar";
  const summary = String(formData.get("summary") ?? "").slice(0, 2000);
  let snap;
  try {
    snap = snapSchema.parse(JSON.parse(String(formData.get("snapshot"))));
  } catch (e) {
    return { error: e instanceof z.ZodError ? e.issues[0]?.message ?? "Datos no válidos." : "Datos no válidos." };
  }
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("save_change_request", {
    p_project_id: projectId,
    p_proposed: snap,
    p_summary: summary,
    p_request_id: requestId,
  });
  if (error) return { error: friendly(error.message) };
  if (enviar) {
    const { error: e2 } = await supabase.rpc("submit_change_request", { p_request_id: id });
    if (e2) return { error: friendly(e2.message) };
  }
  revalidatePath("/", "layout");
  const sep = backTo.includes("?") ? "&" : "?";
  redirect(`${backTo}${sep}guardado=${enviar ? "enviado" : "borrador"}`);
}

export async function guardarCorreccionImportacion(_: EditorState, formData: FormData): Promise<EditorState> {
  const projectId = String(formData.get("projectId"));
  const backTo = String(formData.get("backTo") ?? "/admin/importaciones");
  let snap;
  try {
    snap = snapSchema.parse(JSON.parse(String(formData.get("snapshot"))));
  } catch (e) {
    return { error: e instanceof z.ZodError ? e.issues[0]?.message ?? "Datos no válidos." : "Datos no válidos." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_imported_project", { p_project_id: projectId, s: snap });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/", "layout");
  const sep = backTo.includes("?") ? "&" : "?";
  redirect(`${backTo}${sep}guardado=correccion`);
}

export async function descartarBorrador(formData: FormData) {
  const supabase = await createClient();
  await supabase.rpc("discard_change_request", { p_request_id: String(formData.get("requestId")) });
  revalidatePath("/mis-solicitudes");
  redirect("/mis-solicitudes");
}

export async function enviarBorrador(formData: FormData) {
  const supabase = await createClient();
  await supabase.rpc("submit_change_request", { p_request_id: String(formData.get("requestId")) });
  revalidatePath("/mis-solicitudes");
  redirect("/mis-solicitudes?guardado=enviado");
}
