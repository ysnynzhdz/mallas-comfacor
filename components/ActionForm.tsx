"use client";
import { useActionState } from "react";
import type { ActionState } from "@/app/actions/admin";

/** Formulario que muestra el resultado (error o confirmación) de una acción del servidor. */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {pending && <p className="mt-2 text-sm text-slate-600">Procesando…</p>}
      {state.error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">{state.error}</p>}
      {state.ok && <p role="status" className="mt-3 rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-800 texto-celda">{state.ok}</p>}
    </form>
  );
}
