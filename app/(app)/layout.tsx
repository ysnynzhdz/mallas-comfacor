import { AppHeader } from "@/components/AppHeader";
import { requireUser } from "@/lib/auth";
import { unreadCount } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser();
  const unread = await unreadCount();
  return (
    <>
      <AppHeader profile={profile} unread={unread} />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-center text-xs text-slate-500">
        Institución Educativa COMFACOR Jaime Exbrayat · Montería, Córdoba
      </footer>
    </>
  );
}
