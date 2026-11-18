"use client";
import { useState } from "react";
import type { ExportData } from "@/lib/export/types";

/** Botones para descargar la malla en Word o PDF. `query` son los filtros (area, grado, periodo, asignatura, vigencia). */
export function Descargas({ query, label = "esta malla" }: { query: Record<string, string | undefined>; label?: string }) {
  const [busy, setBusy] = useState<"" | "docx" | "pdf">("");
  const [error, setError] = useState("");

  async function go(kind: "docx" | "pdf") {
    setBusy(kind);
    setError("");
    try {
      const params = new URLSearchParams(Object.entries(query).filter(([, v]) => v) as [string, string][]);
      const res = await fetch(`/api/exportar?${params}`);
      const data = (await res.json()) as ExportData & { error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo preparar la descarga.");
      if (kind === "docx") {
        const { buildDocx } = await import("@/lib/export/docx");
        const blob = await buildDocx(data);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${data.fileName}.docx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      } else {
        const { downloadPdf } = await import("@/lib/export/pdf");
        await downloadPdf(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo descargar.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-slate-600">Descargar {label}:</span>
      <button type="button" onClick={() => go("docx")} disabled={!!busy} className="btn-secundario">
        {busy === "docx" ? "Preparando…" : "📄 Word"}
      </button>
      <button type="button" onClick={() => go("pdf")} disabled={!!busy} className="btn-secundario">
        {busy === "pdf" ? "Preparando…" : "📕 PDF"}
      </button>
      {error && <span role="alert" className="text-sm font-semibold text-red-700">{error}</span>}
    </div>
  );
}
