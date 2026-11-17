import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { SimpleForm } from "@/components/SimpleForm";
import { cambiarClave } from "@/app/actions/auth";
import { getCurrent } from "@/lib/auth";

export default async function CambiarClave() {
  const { user } = await getCurrent();
  if (!user) redirect("/ingresar");
  return (
    <AuthShell title="Crear una contraseña nueva">
      <p className="mb-4 text-sm text-slate-600">Use al menos 10 caracteres. No la comparta con nadie.</p>
      <SimpleForm
        action={cambiarClave}
        submit="Guardar contraseña"
        fields={[
          { name: "password", label: "Nueva contraseña", type: "password", autoComplete: "new-password" },
          { name: "password2", label: "Repita la contraseña", type: "password", autoComplete: "new-password" },
        ]}
      />
    </AuthShell>
  );
}
