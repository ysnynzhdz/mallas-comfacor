"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; ok?: string };

export async function ingresar(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Escriba su correo y su contraseña." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Correo o contraseña incorrectos." };
  redirect("/inicio");
}

export async function salir() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/ingresar");
}

export async function solicitarRecuperacion(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Escriba su correo." };
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/confirmar?siguiente=/cambiar-clave` });
  // Mismo mensaje exista o no la cuenta (no revela qué correos están registrados)
  return { ok: "Si el correo está registrado, recibirá un enlace para crear una nueva contraseña." };
}

export async function cambiarClave(_: FormState, formData: FormData): Promise<FormState> {
  const p1 = String(formData.get("password") ?? "");
  const p2 = String(formData.get("password2") ?? "");
  if (p1.length < 10) return { error: "La contraseña debe tener al menos 10 caracteres." };
  if (p1 !== p2) return { error: "Las dos contraseñas no coinciden." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: p1, data: { must_change_password: false } });
  if (error) return { error: "No se pudo cambiar la contraseña: " + error.message };
  redirect("/inicio");
}
