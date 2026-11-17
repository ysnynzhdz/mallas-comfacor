import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { SimpleForm } from "@/components/SimpleForm";
import { solicitarRecuperacion } from "@/app/actions/auth";

export default function Recuperar() {
  return (
    <AuthShell title="Recuperar contraseña">
      <p className="mb-4 text-sm text-slate-600">Le enviaremos un enlace a su correo para crear una contraseña nueva.</p>
      <SimpleForm
        action={solicitarRecuperacion}
        submit="Enviar enlace"
        fields={[{ name: "email", label: "Correo electrónico", type: "email", autoComplete: "email" }]}
      />
      <p className="mt-4 text-center text-sm">
        <Link href="/ingresar" className="font-semibold text-institucional hover:underline">
          Volver a ingresar
        </Link>
      </p>
    </AuthShell>
  );
}
