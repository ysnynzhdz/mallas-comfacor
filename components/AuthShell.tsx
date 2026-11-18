import { Logo } from "@/components/Logo";

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen bg-papel lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="relative hidden flex-col justify-between bg-tinta p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <Logo size={48} />
          <span className="leading-tight">
            <span className="block text-lg font-bold tracking-wide">Mallas COMFACOR</span>
            <span className="block text-sm text-white/70">I.E. COMFACOR Jaime Exbrayat · Montería</span>
          </span>
        </div>
        <div className="max-w-md">
          <p className="text-3xl font-semibold leading-snug">
            Las mallas curriculares de todas las áreas, en un solo lugar y siempre en su versión aprobada.
          </p>
          <p className="mt-4 text-white/70">De Prejardín a Undécimo. Consulte, compare vigencias y descargue en Word o PDF.</p>
        </div>
        <p className="text-sm text-white/60">Montería, Córdoba</p>
        <div className="franja-vueltiao absolute inset-x-0 bottom-0" aria-hidden />
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="rounded-md bg-tinta p-1.5"><Logo size={36} /></span>
            <span className="leading-tight">
              <span className="block font-bold text-tinta">Mallas COMFACOR</span>
              <span className="block text-sm text-slate-600">I.E. COMFACOR Jaime Exbrayat</span>
            </span>
          </div>
          <h1 className="mb-6 text-2xl font-semibold text-tinta">{title}</h1>
          {children}
        </div>
      </section>
    </main>
  );
}
