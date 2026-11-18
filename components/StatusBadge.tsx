import { PLAN_STATUS_LABEL, REQUEST_STATUS_LABEL, type PlanStatus, type RequestStatus } from "@/lib/types";

const COLORS: Record<string, string> = {
  publicada: "bg-green-100 text-green-800",
  aprobado: "bg-green-100 text-green-800",
  importada: "bg-amber-100 text-amber-800",
  en_revision: "bg-amber-100 text-amber-800",
  pendiente_aprobacion: "bg-blue-100 text-blue-800",
  pendiente: "bg-blue-100 text-blue-800",
  rechazado: "bg-red-100 text-red-800",
  requiere_actualizacion: "bg-orange-100 text-orange-800",
  borrador: "bg-slate-200 text-slate-700",
  sin_importar: "bg-slate-200 text-slate-700",
};

export function StatusBadge({ plan, request }: { plan?: PlanStatus; request?: RequestStatus }) {
  const key = plan ?? request ?? "borrador";
  const label = plan ? PLAN_STATUS_LABEL[plan] : REQUEST_STATUS_LABEL[request!];
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${COLORS[key] ?? "bg-slate-200"}`}>
      {label}
    </span>
  );
}
