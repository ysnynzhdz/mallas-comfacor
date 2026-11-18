import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, Packer, PageBreak, PageNumber, PageOrientation,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
} from "docx";
import { columnGroups, layoutRows } from "@/lib/table";
import { clean, type ExportData } from "@/lib/export/types";

const AZUL = "1F4E79";
const border = { style: BorderStyle.SINGLE, size: 4, color: "8A9BB0" };
const borders = { top: border, bottom: border, left: border, right: border };

function paras(text: string, opts: { bold?: boolean; color?: string; size?: number } = {}) {
  const lines = clean(text).split("\n");
  return lines.map((l) => new Paragraph({ children: [new TextRun({ text: l, bold: opts.bold, color: opts.color, size: opts.size ?? 16 })] }));
}

/** Construye el .docx (carta horizontal) y devuelve un Blob. */
export async function buildDocx(d: ExportData): Promise<Blob> {
  const children: (Paragraph | Table)[] = [];
  d.items.forEach((it, idx) => {
    const s = it.snap;
    if (idx > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `${d.area} · ${it.grade} · Período ${it.period}${it.subject ? ` · ${it.subject}` : ""} · Vigencia ${d.year}`, bold: true, color: "555555", size: 18 })],
      }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: `${s.label} ${s.number_text}: ${clean(s.name) || "(Sin nombre en el documento)"}`, bold: true, color: AZUL, size: 28 })],
        spacing: { after: 120 },
      }),
    );
    if (s.purpose) {
      children.push(new Paragraph({ children: [new TextRun({ text: s.purpose_label, bold: true, color: AZUL, size: 18 })] }), ...paras(s.purpose, { size: 18 }));
    }
    for (const h of s.header_fields ?? []) {
      if (!h.value?.trim() && !h.label?.trim()) continue;
      children.push(new Paragraph({ children: [
        ...(h.label ? [new TextRun({ text: `${h.label}: `, bold: true, size: 18 })] : []),
        new TextRun({ text: clean(h.value), size: 18 }),
      ] }));
    }
    children.push(new Paragraph({ text: "", spacing: { after: 80 } }));

    const cols = s.columns;
    const head: TableRow[] = [];
    const hdrCell = (text: string, span = 1) =>
      new TableCell({
        columnSpan: span,
        borders,
        shading: { type: ShadingType.CLEAR, color: "auto", fill: AZUL },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: clean(text), bold: true, color: "FFFFFF", size: 16 })] })],
      });
    if (cols.some((c) => c.group)) head.push(new TableRow({ tableHeader: true, children: columnGroups(cols).map((g) => hdrCell(g.label, g.span)) }));
    head.push(new TableRow({ tableHeader: true, children: cols.map((c) => hdrCell(c.label)) }));
    const body = layoutRows(cols, s.rows).map(
      (r) =>
        new TableRow({
          cantSplit: false,
          children: r
            .filter((c) => c.kind === "cell")
            .map((c) =>
              c.kind === "cell"
                ? new TableCell({ rowSpan: c.rowSpan, columnSpan: c.colSpan, borders, children: paras(c.text || " ") })
                : new TableCell({ children: [new Paragraph("")] }),
            ),
        }),
    );
    if (cols.length) {
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [...head, ...body] }));
    }
  });

  const doc = new Document({
    creator: "MALLAS COMFACOR",
    title: d.title,
    styles: { default: { document: { run: { font: "Arial", size: 18 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE, width: 12240, height: 15840 },
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        headers: {
          default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: `Institución Educativa COMFACOR · ${d.title}`, size: 16, color: "666666" })] })] }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: ["Página ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES], size: 16, color: "666666" })] })],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}
