import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/** Enlace del correo de recuperación: valida el código y abre la pantalla de nueva contraseña. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("siguiente") ?? "/cambiar-clave";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/cambiar-clave";
  const supabase = await createClient();
  let ok = false;
  if (token_hash && type) ok = !(await supabase.auth.verifyOtp({ token_hash, type })).error;
  else if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  return NextResponse.redirect(new URL(ok ? safeNext : "/ingresar?error=enlace", url.origin));
}
