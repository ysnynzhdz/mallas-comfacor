import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MALLAS COMFACOR",
  description: "Mallas curriculares de la I.E. COMFACOR Jaime Exbrayat",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
