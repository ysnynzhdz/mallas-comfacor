import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getAreas } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function Perfil() {
  const { profile } = await requireUser();
  const s = await createClient();
  const { data } = await s.from("teacher_area_assignments").select("area_id, grades_attended").eq("teacher_id", profile.id).eq("active", true);
  const areas = await getAreas();
  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-2xl font-bold">Mi perfil</h1>
      <dl className="tarjeta space-y-3">
        <div><dt className="etiqueta">Nombre</dt><dd>{profile.full_name || "—"}</dd></div>
        <div><dt className="etiqueta">Correo</dt><dd>{profile.email}</dd></div>
        <div><dt className="etiqueta">Rol</dt><dd>{profile.role === "admin" ? "Administrador" : "Docente"}</dd></div>
        <div>
          <dt className="etiqueta">Áreas que puedo editar</dt>
          <dd>
            {profile.role === "admin"
              ? "Todas"
              : (data ?? []).length
                ? (data ?? []).map((d) => areas.find((a) => a.id === d.area_id)?.name + (d.grades_attended ? ` (${d.grades_attended})` : "")).join(", ")
                : "Ninguna asignada todavía"}
          </dd>
        </div>
      </dl>
      <p className="mt-4">
        <Link href="/cambiar-clave" className="btn-secundario">Cambiar mi contraseña</Link>
      </p>
    </div>
  );
}
