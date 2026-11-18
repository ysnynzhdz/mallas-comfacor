import JSZip from "jszip";
import { clean, type ExportData, type ExportItem } from "@/lib/export/types";
import type { Column } from "@/lib/types";

/**
 * Malla para estudiantes: Word en el membrete institucional (public/plantillas/membrete-comfacor.docx).
 * Formato tomado del ejemplo del colegio: encabezado institucional, fila DOCENTE / ÁREA / PERÍODO,
 * NOMBRE DE LA UNIDAD y una sola fila con las columnas elegidas (por defecto DBA, evidencias y contenidos).
 * El texto de la malla no se modifica: solo se seleccionan columnas.
 */
export type StudentCategory = "aprendizaje" | "evidencia" | "contenido" | "componente" | "instrumento";

export function pickColumns(cols: Column[], cats: StudentCategory[]): Column[] {
  const out: Column[] = [];
  for (const cat of cats) {
    const list = cols.filter((c) => c.category === cat);
    if (!list.length) continue;
    if (cat === "aprendizaje" && list.length > 1) {
      const dba = list.find((c) => /\bDBA\b|DERECHOS B[AÁ]SICOS/i.test(c.label));
      const other = list.find((c) => !/descripci|proceso|grupo de est|est[aá]ndar general|est[aá]ndares espec/i.test(c.label));
      out.push(dba ?? other ?? list[0]);
    } else out.push(...list);
  }
  return out;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type P = { bold?: boolean; italic?: boolean; center?: boolean; size?: number; font?: string; after?: number };
function para(text: string, o: P = {}) {
  const font = o.font ?? "Times New Roman";
  const rpr = `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>${o.bold ? "<w:b/>" : ""}${o.italic ? "<w:i/>" : ""}<w:sz w:val="${(o.size ?? 10) * 2}"/><w:szCs w:val="${(o.size ?? 10) * 2}"/><w:lang w:val="es-CO"/></w:rPr>`;
  const ppr = `<w:pPr><w:spacing w:before="0" w:after="${o.after ?? 0}" w:line="240" w:lineRule="auto"/>${o.center ? '<w:jc w:val="center"/>' : ""}</w:pPr>`;
  return `<w:p>${ppr}<w:r>${rpr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}
/** Un párrafo con etiqueta en negrilla y valor normal. */
function labeled(label: string, value: string) {
  const r = (t: string, b: boolean) =>
    `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>${b ? "<w:b/>" : ""}<w:sz w:val="22"/><w:lang w:val="es-CO"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  return `<w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr>${r(label + " ", true)}${r(value, false)}</w:p>`;
}
function textParas(text: string, o: P = {}) {
  const lines = clean(text).split("\n");
  return lines.map((l) => para(l, o)).join("");
}
function cell(content: string, width: number, span = 1, shade?: string) {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ""}${shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>` : ""}<w:tcMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar></w:tcPr>${content || "<w:p/>"}</w:tc>`;
}

/** Une los valores de una columna (sin repetir celdas combinadas) en un solo texto. */
function columnText(item: ExportItem, col: Column) {
  const vals: string[] = [];
  for (const r of item.snap.rows) {
    const v = (r.cells as Record<string, unknown>)[col.key];
    if (typeof v === "string" && v.trim() && vals[vals.length - 1] !== v) vals.push(v);
  }
  return vals.join("\n\n");
}

function unitXml(d: ExportData, it: ExportItem, cats: StudentCategory[], fecha: string) {
  const sh = d.sheet!;
  const s = it.snap;
  const cols = pickColumns(s.columns, cats);
  const k = Math.max(cols.length, 1);
  const total = 9404;
  const w = Math.floor(total / k);
  const docente = (s.header_fields ?? []).find((h) => /DOCENTE/i.test(h.label))?.value?.trim() ?? "";
  const area = it.subject ? `${d.area} (${it.subject})` : d.area;
  const unidad = `${s.label} ${s.number_text}`.trim();

  let x = "";
  x += para(`${sh.ciudad}, ${fecha}`, { size: 10, font: "Arial", after: 120 });
  x += para(sh.titulo, { bold: true, center: true, size: 12, font: "Arial" });
  x += para(sh.lema_anio, { bold: true, center: true, size: 11, font: "Arial" });
  x += para(sh.lema, { italic: true, center: true, size: 11, font: "Arial" });
  x += para(sh.subtitulo, { bold: true, center: true, size: 12, font: "Arial" });
  x += para(sh.documento, { bold: true, center: true, size: 12, font: "Arial", after: 160 });

  const grid = `<w:tblGrid>${Array.from({ length: k }, () => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`;
  const b = (t: string) => `<w:${t} w:val="single" w:sz="6" w:space="0" w:color="000000"/>`;
  const tblPr = `<w:tblPr><w:tblW w:w="${w * k}" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>${b("top")}${b("left")}${b("bottom")}${b("right")}${b("insideH")}${b("insideV")}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>`;

  // Fila 1: DOCENTE | ÁREA (y grado) | PERÍODO
  const docCell = labeled("DOCENTE:", docente);
  const areaCell = labeled("ÁREA:", area) + labeled("GRADO:", it.grade);
  const perCell = labeled("PERÍODO:", String(it.period));
  let row1 = "";
  if (k >= 3) row1 = cell(docCell, w * (k - 2), k - 2) + cell(areaCell, w) + cell(perCell, w);
  else if (k === 2) row1 = cell(docCell, w) + cell(areaCell + perCell, w);
  else row1 = cell(docCell + areaCell + perCell, w);
  const row2 = cell(labeled("NOMBRE DE LA UNIDAD:", `${unidad ? unidad + ": " : ""}${clean(s.name)}`), w * k, k);
  const row3 = cols.map((c) => cell(para(clean(c.label), { center: true, size: 11 }), w)).join("") || cell(para(""), w);
  const row4 = cols.map((c) => cell(textParas(columnText(it, c), { size: 10.5 }), w)).join("") || cell(para("(Esta unidad no tiene columnas de este tipo)"), w);
  x += `<w:tbl>${tblPr}${grid}<w:tr>${row1}</w:tr><w:tr>${row2}</w:tr><w:tr><w:trPr><w:tblHeader/></w:trPr>${row3}</w:tr><w:tr>${row4}</w:tr></w:tbl>`;
  if (sh.nota?.trim()) x += para("", { after: 80 }) + para(sh.nota, { italic: true, center: true, size: 10.5, font: "Arial" });
  return x;
}

export async function buildStudentDocx(d: ExportData, cats: StudentCategory[], template?: ArrayBuffer): Promise<Blob> {
  if (!d.sheet) throw new Error("Falta el formato de la malla para estudiantes.");
  if (!template) {
    const res = await fetch("/plantillas/membrete-comfacor.docx");
    if (!res.ok) throw new Error("No se encontró la plantilla del membrete.");
    template = await res.arrayBuffer();
  }
  const zip = await JSZip.loadAsync(template);
  const xml = await zip.file("word/document.xml")!.async("string");
  const bodyStart = xml.indexOf("<w:body>") + "<w:body>".length;
  const sectStart = xml.lastIndexOf("<w:sectPr");
  const fecha = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  const body = d.items.map((it) => unitXml(d, it, cats, fecha)).join(pageBreak);
  zip.file("word/document.xml", xml.slice(0, bodyStart) + body + xml.slice(sectStart));
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}
