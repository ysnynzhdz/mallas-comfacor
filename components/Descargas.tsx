"use client";
import { useState } from "react";
import type { ExportData } from "@/lib/export/types";

const ORDER = ["componente", "aprendizaje", "evidencia", "contenido", "instrumento"];

/** Botones para descargar la malla en Word o PDF. `query` son los filtros (area, grado, periodo, asignatura, vigencia). */
export function Descargas({ query, label = "esta malla" }: { query: Record<string, string | undefined>; label?: string }) {
  const [busy, setBusy] = useState<"" | "docx" | "pdf" | "est">("");
  const [cats, setCats] = useState<string[]>(["aprendizaje", "evidencia", "contenido"]);
  const [error, setError] = useState("");

  async function go(kind: "docx" | "pdf" | "est") {
    setBusy(kind);
    setError("");
    try {
      const params = new URLSearchParams(Object.entries(query).filter(([, v]) => v) as [string, string][]);
      const res = await fetch(`/api/exportar?${params}`);
      const data = (await res.json()) as ExportData & { error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo preparar la descarga.");
      if (kind === "docx" || kind === "est") {
        let blob: Blob;
        if (kind === "est") {
          if (!cats.length) throw new Error("Elija al menos una columna para la malla de estudiantes.");
          const { buildStudentDocx } = await import("@/lib/export/estudiantes");
          blob = await buildStudentDocx(data, cats as never);
        } else {
          const { buildDocx } = await import("@/lib/export/docx");
          blob = await buildDocx(data);
        }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = kind === "est" ? `${data.fileName.replace(/^Malla_/, "Malla_estudiantes_")}.docx` : `${data.fileName}.docx`;
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
      <details className="relative">
        <summary className="btn-secundario cursor-pointer list-none [&::-webkit-details-marker]:hidden">🎒 Malla para estudiantes</summary>
        <div className="absolute left-0 z-20 mt-2 w-72 rounded-lg border border-linea bg-white p-4 text-sm shadow-lg">
          <p className="mb-2 font-semibold text-tinta">Word con el membrete del colegio</p>
          <p className="mb-3 text-slate-600">Columnas que se incluyen (el texto va tal como está en la malla):</p>
          {[
            ["aprendizaje", "DBA o aprendizajes"],
            ["evidencia", "Evidencias de aprendizaje"],
            ["contenido", "Contenidos"],
            ["componente", "Componentes"],
            ["instrumento", "Instrumentos de evaluación"],
          ].map(([k, l]) => (
            <label key={k} className="mb-1.5 flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4"
                checked={cats.includes(k)}
                onChange={(e) => setCats((c) => (e.target.checked ? [...c, k].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)) : c.filter((x) => x !== k)))}
              />
              {l}
            </label>
          ))}
          <button type="button" onClick={() => go("est")} disabled={!!busy} className="btn-primario mt-3 w-full">
            {busy === "est" ? "Preparando…" : "Descargar en Word"}
          </button>
        </div>
      </details>
      {error && <span role="alert" className="text-sm font-semibold text-red-700">{error}</span>}
    </div>
  );
}
