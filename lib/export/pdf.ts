import { columnGroups, layoutRows } from "@/lib/table";
import { clean, type ExportData } from "@/lib/export/types";

const AZUL = "#1F4E79";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Construye el PDF (carta horizontal) con pdfmake y lo descarga. */
export async function downloadPdf(d: ExportData) {
  const pdfMake: any = (await import("pdfmake/build/pdfmake")).default ?? (await import("pdfmake/build/pdfmake"));
  const vfsMod: any = await import("pdfmake/build/vfs_fonts");
  pdfMake.addVirtualFileSystem(vfsMod.default ?? vfsMod);

  const content: any[] = [];
  d.items.forEach((it, idx) => {
    const s = it.snap;
    content.push({
      text: `${d.area} · ${it.grade} · Período ${it.period}${it.subject ? ` · ${it.subject}` : ""} · Vigencia ${d.year}`,
      style: "meta",
      ...(idx > 0 ? { pageBreak: "before" } : {}),
    });
    content.push({ text: `${s.label} ${s.number_text}: ${clean(s.name) || "(Sin nombre en el documento)"}`, style: "titulo" });
    if (s.purpose) content.push({ text: [{ text: `${s.purpose_label}: `, bold: true, color: AZUL }, clean(s.purpose)], margin: [0, 0, 0, 4] });
    for (const h of s.header_fields ?? []) {
      if (!h.value?.trim() && !h.label?.trim()) continue;
      content.push({ text: [...(h.label ? [{ text: `${h.label}: `, bold: true }] : []), clean(h.value)], margin: [0, 0, 0, 2] });
    }
    const cols = s.columns;
    if (!cols.length) return;
    const body: any[][] = [];
    const hdr = (t: string, extra: any = {}) => ({ text: clean(t), bold: true, color: "white", fillColor: AZUL, alignment: "center", ...extra });
    let headerRows = 1;
    if (cols.some((c) => c.group)) {
      const row: any[] = [];
      for (const g of columnGroups(cols)) {
        row.push(hdr(g.label, g.span > 1 ? { colSpan: g.span } : {}));
        for (let k = 1; k < g.span; k++) row.push({});
      }
      body.push(row);
      headerRows = 2;
    }
    body.push(cols.map((c) => hdr(c.label)));
    for (const r of layoutRows(cols, s.rows)) {
      const row: any[] = [];
      for (const c of r) {
        if (c.kind === "covered") { row.push({}); continue; }
        row.push({ text: clean(c.text), ...(c.rowSpan > 1 ? { rowSpan: c.rowSpan } : {}), ...(c.colSpan > 1 ? { colSpan: c.colSpan } : {}) });
        for (let k = 1; k < c.colSpan; k++) row.push({});
      }
      while (row.length < cols.length) row.push({});
      body.push(row);
    }
    content.push({
      margin: [0, 6, 0, 0],
      table: { headerRows, widths: cols.map(() => "*"), body, dontBreakRows: false },
      layout: { hLineColor: () => "#8A9BB0", vLineColor: () => "#8A9BB0", hLineWidth: () => 0.5, vLineWidth: () => 0.5, paddingLeft: () => 3, paddingRight: () => 3 },
      fontSize: 7.5,
    });
  });

  const doc = {
    pageSize: "LETTER",
    pageOrientation: "landscape",
    pageMargins: [28, 40, 28, 34],
    info: { title: d.title, creator: "MALLAS COMFACOR" },
    header: { text: `Institución Educativa COMFACOR · ${d.title}`, fontSize: 8, color: "#666666", margin: [28, 16, 28, 0] },
    footer: (page: number, pages: number) => ({ text: `Página ${page} de ${pages}`, alignment: "right", fontSize: 8, color: "#666666", margin: [28, 8, 28, 0] }),
    content,
    defaultStyle: { font: "Roboto", fontSize: 9 },
    styles: {
      meta: { fontSize: 9, bold: true, color: "#555555" },
      titulo: { fontSize: 14, bold: true, color: AZUL, margin: [0, 2, 0, 6] },
    },
  };
  await pdfMake.createPdf(doc).download(`${d.fileName}.pdf`);
}
