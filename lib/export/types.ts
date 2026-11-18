import type { Snapshot } from "@/lib/types";

export type ExportItem = { grade: string; period: number; subject: string | null; snap: Snapshot };
export type StudentSheet = { titulo: string; lema_anio: string; lema: string; subtitulo: string; documento: string; ciudad: string; nota: string };
export type ExportData = { title: string; area: string; year: number; fileName: string; items: ExportItem[]; sheet?: StudentSheet };

/** Limpia caracteres que las fuentes no tienen (viñetas de Word del rango privado, etc.). */
export const clean = (s: string) =>
  (s ?? "")
    .replace(/[]/g, "•")
    .replace(/[-]/g, "")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n");
