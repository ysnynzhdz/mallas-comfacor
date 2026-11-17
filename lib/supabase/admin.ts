import "server-only";
import { createClient as createSb } from "@supabase/supabase-js";

/**
 * Cliente con la clave secreta. SOLO para crear cuentas o restablecer contraseñas,
 * siempre después de verificar que quien lo pide es administrador.
 * La clave vive únicamente en las variables de entorno del servidor (Vercel).
 */
export function adminClientOrNull() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  return createSb(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
