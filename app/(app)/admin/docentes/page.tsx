import { ActionForm } from "@/components/ActionForm";
import { requireAdmin } from "@/lib/auth";
import { getAreas } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { actualizarDocente, crearDocente, restablecerClave } from "@/app/actions/admin";
import type { Profile } from "@/lib/types";

export default async function Docentes() {
  const { profile: me } = await requireAdmin();
  const s = await createClient();
  const { data: profiles } = await s.from("profiles").select("id, full_name, email, role, active").order("full_name");
  const { data: assigns } = await s.from("teacher_area_assignments").select("teacher_id, area_id, active, grades_attended").is("academic_year_id", null);
  const areas = await getAreas();
  const hasSecret = Boolean(process.env.SUPABASE_SECRET_KEY);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Docentes y permisos</h1>

      <section className="tarjeta mb-6">
        <h2 className="mb-2 text-lg font-bold">Crear una cuenta</h2>
        {hasSecret ? (
          <ActionForm action={crearDocente} className="grid gap-3 md:grid-cols-3 md:items-end">
            <div><label className="etiqueta" htmlFor="n">Nombre completo</label><input id="n" name="full_name" className="campo" required /></div>
            <div><label className="etiqueta" htmlFor="e">Correo</label><input id="e" name="email" type="email" className="campo" required /></div>
            <button className="btn-primario">Crear cuenta</button>
          </ActionForm>
        ) : (
          <div className="text-sm text-slate-700">
            <p className="mb-2">
              Para crear cuentas desde aquí falta configurar la <strong>clave secreta de Supabase</strong> en Vercel (se hace una sola vez; no la
              escriba en el chat). Mientras tanto, la cuenta puede crearse en Supabase → Authentication → Users → <em>Add user</em>, y aparecerá
              en esta lista para activarla.
            </p>
          </div>
        )}
      </section>

      <ul className="space-y-4">
        {((profiles ?? []) as Profile[]).map((p) => {
          const mine = (assigns ?? []).filter((a) => a.teacher_id === p.id);
          const activeAreas = new Set(mine.filter((a) => a.active).map((a) => a.area_id));
          const grades = mine.find((a) => a.grades_attended)?.grades_attended ?? "";
          const self = p.id === me.id;
          return (
            <li key={p.id} className={`tarjeta ${p.active ? "" : "border-2 border-amber-300"}`}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-bold">{p.full_name || "(sin nombre)"}</span>
                <span className="text-sm text-slate-600">{p.email}</span>
                {p.role === "admin" && <span className="rounded-full bg-institucional px-2 py-0.5 text-xs font-bold text-white">Administrador</span>}
                {!p.active && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">Inactiva</span>}
              </div>
              <ActionForm action={actualizarDocente} className="space-y-3">
                <input type="hidden" name="id" value={p.id} />
                <div className="grid gap-3 md:grid-cols-3">
                  <div><label className="etiqueta">Nombre</label><input name="full_name" defaultValue={p.full_name} className="campo" /></div>
                  <div>
                    <label className="etiqueta">Rol</label>
                    <select name="role" defaultValue={p.role} className="campo" disabled={self}>
                      <option value="docente">Docente</option>
                      <option value="admin">Administrador</option>
                    </select>
                    {self && <input type="hidden" name="role" value="admin" />}
                  </div>
                  <div>
                    <label className="etiqueta">Estado</label>
                    <select name="active" defaultValue={p.active ? "1" : "0"} className="campo" disabled={self}>
                      <option value="1">Activa</option>
                      <option value="0">Inactiva</option>
                    </select>
                    {self && <input type="hidden" name="active" value="1" />}
                  </div>
                </div>
                {p.role !== "admin" && (
                  <>
                    <fieldset>
                      <legend className="etiqueta">Áreas que puede editar</legend>
                      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                        {areas.map((a) => (
                          <label key={a.id} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" name="areas" value={a.id} defaultChecked={activeAreas.has(a.id)} className="size-4" />
                            {a.name}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div><label className="etiqueta">Grados o niveles que atiende</label><input name="grades_attended" defaultValue={grades} className="campo" placeholder="Ej.: 6° y 7°" /></div>
                  </>
                )}
                <button className="btn-primario">Guardar</button>
              </ActionForm>
              {hasSecret && !self && (
                <ActionForm action={restablecerClave} className="mt-3">
                  <input type="hidden" name="id" value={p.id} />
                  <button className="btn-secundario min-h-9 text-sm">Generar contraseña temporal</button>
                </ActionForm>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
