import { Logo } from "@/components/Logo";

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-institucional p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="rounded-lg bg-institucional p-1">
            <Logo size={44} />
          </span>
          <div>
            <p className="text-xl font-black text-institucional">MALLAS COMFACOR</p>
            <p className="text-sm text-slate-600">I.E. COMFACOR Jaime Exbrayat · Montería</p>
          </div>
        </div>
        <h1 className="mb-4 text-xl font-bold">{title}</h1>
        {children}
      </div>
    </main>
  );
}
