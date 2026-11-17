import { AuthShell } from "@/components/AuthShell";
import { salir } from "@/app/actions/auth";

export default function CuentaInactiva() {
  return (
    <AuthShell title="Cuenta pendiente de activación">
      <p className="mb-6 text-slate-700">
        Su cuenta existe, pero el administrador todavía no la ha activado. Cuando lo haga podrá consultar las mallas.
      </p>
      <form action={salir}>
        <button className="btn-secundario w-full">Cerrar sesión</button>
      </form>
    </AuthShell>
  );
}
