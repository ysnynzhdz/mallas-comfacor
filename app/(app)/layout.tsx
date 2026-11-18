import { AppHeader } from "@/components/AppHeader";
import { requireUser } from "@/lib/auth";
import { unreadCount } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser();
  const unread = await unreadCount();
  return (
    <>
      <AppHeader profile={profile} unread={unread} />
      <main className="mx-auto min-h-[70vh] max-w-7xl px-4 py-8">{children}</main>
      <footer className="border-t border-linea">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-2 px-4 py-5 text-xs text-slate-500">
          <span>Institución Educativa COMFACOR Jaime Exbrayat, Montería (Córdoba)</span>
          <span>Mallas curriculares institucionales</span>
        </div>
      </footer>
    </>
  );
}
