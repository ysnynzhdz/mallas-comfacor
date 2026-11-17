import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** Usuario actual y su perfil (una consulta por solicitud). */
export const getCurrent = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { supabase, user: null, profile: null as Profile | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, active")
    .eq("id", data.user.id)
    .maybeSingle();
  return { supabase, user: data.user, profile: (profile as Profile | null) ?? null };
});

/** Exige sesión iniciada y cuenta activa. */
export async function requireUser() {
  const ctx = await getCurrent();
  if (!ctx.user) redirect("/ingresar");
  if (ctx.user.user_metadata?.must_change_password) redirect("/cambiar-clave");
  if (!ctx.profile || !ctx.profile.active) redirect("/cuenta-inactiva");
  return ctx as typeof ctx & { profile: Profile };
}

/** Exige rol de administrador (además, cada operación lo verifica en la base de datos). */
export async function requireAdmin() {
  const ctx = await requireUser();
  if (ctx.profile.role !== "admin") redirect("/inicio");
  return ctx;
}

/** Áreas que el usuario puede editar. */
export async function editableAreaIds(profile: Profile): Promise<Set<string> | "all"> {
  if (profile.role === "admin") return "all";
  const supabase = await createClient();
  const { data } = await supabase
    .from("teacher_area_assignments")
    .select("area_id")
    .eq("teacher_id", profile.id)
    .eq("active", true);
  return new Set((data ?? []).map((r) => r.area_id as string));
}
