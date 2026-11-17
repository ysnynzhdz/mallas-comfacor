"use client";
import { useActionState } from "react";
import type { FormState } from "@/app/actions/auth";

type Field = { name: string; label: string; type?: string; autoComplete?: string };

export function SimpleForm({
  action,
  fields,
  submit,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  fields: Field[];
  submit: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      {fields.map((f) => (
        <div key={f.name}>
          <label className="etiqueta" htmlFor={f.name}>
            {f.label}
          </label>
          <input id={f.name} name={f.name} type={f.type ?? "text"} autoComplete={f.autoComplete} className="campo" required />
        </div>
      ))}
      {state.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-800">{state.ok}</p>}
      <button className="btn-primario w-full" disabled={pending}>
        {pending ? "Un momento…" : submit}
      </button>
    </form>
  );
}
