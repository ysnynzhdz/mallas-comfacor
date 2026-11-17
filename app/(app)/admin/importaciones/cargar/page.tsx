import { ActionForm } from "@/components/ActionForm";
import { requireAdmin } from "@/lib/auth";
import { cargarImportacion } from "@/app/actions/admin";

export default async function Cargar() {
  await requireAdmin();
  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold">Cargar una importación</h1>
      <p className="mb-6 text-slate-600">
        Los documentos Word se leen con el importador (sin modificarlos). Aquí se carga el resultado como <strong>borrador</strong>: nada se
        publica hasta que usted lo revise y lo apruebe.
      </p>
      <ActionForm action={cargarImportacion} className="tarjeta space-y-4">
        <label className="etiqueta" htmlFor="archivo">Importación disponible</label>
        <select id="archivo" name="archivo" className="campo">
          <option value="matematicas-2024">Matemáticas · vigencia 2024 · archivo «9. Matemáticas.docx»</option>
        </select>
        <button className="btn-primario">Cargar como borrador para revisión</button>
      </ActionForm>
    </div>
  );
}
