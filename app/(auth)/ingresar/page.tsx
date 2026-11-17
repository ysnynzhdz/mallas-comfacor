import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { SimpleForm } from "@/components/SimpleForm";
import { ingresar } from "@/app/actions/auth";

export default function Ingresar() {
  return (
    <AuthShell title="Ingresar">
      <SimpleForm
        action={ingresar}
        submit="Ingresar"
        fields={[
          { name: "email", label: "Correo electrónico", type: "email", autoComplete: "email" },
          { name: "password", label: "Contraseña", type: "password", autoComplete: "current-password" },
        ]}
      />
      <p className="mt-4 text-center text-sm">
        <Link href="/recuperar" className="font-semibold text-institucional hover:underline">
          Olvidé mi contraseña
        </Link>
      </p>
    </AuthShell>
  );
}
