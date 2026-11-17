"""
MALLAS COMFACOR · Importador de mallas curriculares desde Word (.docx)

Lee un documento original SIN modificarlo y produce un JSON con:
  - proyectos/unidades por grado y período (encabezado, columnas originales, filas)
  - información general del área (todo lo que no es una malla)
  - alertas para revisión del administrador
Reglas: no resume, no corrige, no completa. Conserva saltos de línea.
Uso: python3 -I importar_docx.py <archivo.docx> <salida.json>
"""
import sys, re, json, hashlib, os, datetime
from docx import Document
from docx.oxml.ns import qn

VERSION = "1.0.0"

GRADOS = [  # (slug, patrones) — el orden importa: UNDÉCIMO antes que DÉCIMO
    ("prejardin", [r"PRE[\s-]*JARD[IÍ]N"]),
    ("jardin", [r"(?<!PRE)(?<!PRE-)(?<!PRE )JARD[IÍ]N"]),
    ("transicion", [r"TRANSICI[OÓ]N"]),
    ("primero", [r"\b1\s*°", r"PRIMERO"]),
    ("segundo", [r"\b2\s*°", r"SEGUNDO"]),
    ("tercero", [r"\b3\s*°", r"TERCERO"]),
    ("cuarto", [r"\b4\s*°", r"CUARTO"]),
    ("quinto", [r"\b5\s*°", r"QUINTO"]),
    ("sexto", [r"\b6\s*°", r"SEXTO"]),
    ("septimo", [r"\b7\s*°", r"S[EÉ]PTIMO"]),
    ("octavo", [r"\b8\s*°", r"OCTAVO"]),
    ("noveno", [r"\b9\s*°", r"NOVENO"]),
    ("undecimo", [r"\b11\s*°", r"UND[EÉ]CIMO"]),
    ("decimo", [r"\b10\s*°", r"(?<!UN)D[EÉ]CIMO"]),
]

def norm(s):
    return re.sub(r"[ \t ]+", " ", s).strip()

def detect_grade(text):
    """Devuelve el slug de grado si el texto es un título de grado."""
    t = text.upper()
    if not re.search(r"GRADO", t):
        return None
    if re.search(r"AL TERMINAR|EST[AÁ]NDARES", t):
        return None
    t2 = t.split("GRADO", 1)[1]
    for slug, pats in GRADOS:
        for p in pats:
            if re.search(p, t2):
                return slug
    return None

def detect_period(text):
    t = text.upper()
    m = re.search(r"(1|2|3|PRIMER|SEGUNDO|TERCER)\s*(ER|°|º)?\s*\.?\s*PER[IÍ]ODO", t)
    if not m:
        return None
    v = m.group(1)
    return {"1": 1, "PRIMER": 1, "2": 2, "SEGUNDO": 2, "3": 3, "TERCER": 3}[v]

def tc_text(tc):
    paras = []
    for p in tc.findall(qn("w:p")):   # solo párrafos propios; las tablas anidadas se procesan aparte
        paras.append("".join(t.text or "" for t in p.iter(qn("w:t"))))
    # quitar líneas vacías al inicio y al final, conservar las internas
    while paras and not paras[0].strip(): paras.pop(0)
    while paras and not paras[-1].strip(): paras.pop()
    return "\n".join(norm(p) for p in paras)

def grid_row(tr):
    """Lista de celdas reales de la fila: dict(tc, start, span, vmerge, text)."""
    out, g = [], 0
    for tc in tr.findall(qn("w:tc")):
        tcPr = tc.find(qn("w:tcPr"))
        span, vm = 1, None
        if tcPr is not None:
            gs = tcPr.find(qn("w:gridSpan"))
            if gs is not None: span = int(gs.get(qn("w:val")))
            v = tcPr.find(qn("w:vMerge"))
            if v is not None: vm = v.get(qn("w:val")) or "continue"
        out.append({"tc": tc, "start": g, "span": span, "vmerge": vm, "text": tc_text(tc)})
        g += span
    return out

def table_rows(tbl):
    return [grid_row(tr) for tr in tbl.findall(qn("w:tr"))]

def distinct_texts(row):
    return [c["text"] for c in row if c["vmerge"] != "continue"]

HEADER_KW = ["COMPETENCIA", "COMPONENTE", "APRENDIZAJE", "EVIDENCIA", "CONTENIDO", "INSTRUMENTO",
             "DERECHOS B", "DBA", "PENSAMIENTO", "PROCESOS", "DESEMPE", "EST[AÁ]NDAR", "CRITERIO", "AFIRMACI"]

def header_like(row):
    cells = [norm(c["text"]).upper() for c in row if c["text"].strip()]
    if len(cells) < 3: return False
    hits = sum(1 for c in cells if len(c) < 90 and any(re.search(k, c) for k in HEADER_KW))
    return hits >= 3 and hits >= len(cells) - 1

def category(label):
    u = label.upper()
    if "EVIDENCIA" in u: return "evidencia"
    if "INSTRUMENTO" in u or "CRITERIO" in u: return "instrumento"
    if "CONTENIDO" in u or "TEMA" in u: return "contenido"
    if re.search(r"APRENDIZAJE|AFIRMACI|DERECHOS|DBA|DESEMPE|PROCESOS|EST[AÁ]NDAR", u): return "aprendizaje"
    if re.search(r"COMPONENTE|PENSAMIENTO|COMPETENCIA|EJE", u): return "componente"
    return "otra"

def split_label(text):
    m = re.match(r"^([^:\n]{1,70}):\s*(.*)$", text, re.S)
    if m: return m.group(1).strip(), m.group(2).strip()
    return "", text.strip()

class Importer:
    def __init__(self, path):
        self.path = path
        self.doc = Document(path)
        self.alerts = []
        self.projects = {}   # (grade, period) -> project
        self.general = []
        self.teachers = []

    def alert(self, nivel, ubicacion, mensaje):
        self.alerts.append({"nivel": nivel, "ubicacion": ubicacion, "mensaje": mensaje})

    # ---------- proyectos de grados 1° a 11° (formato "UNIDAD") ----------
    def parse_unit(self, rows, grade, where):
        joined0 = " ".join(distinct_texts(rows[0]))
        header_fields, number, name = [], "", ""
        m = re.search(r"UNIDAD\s*N\s*[°º]?\s*:?\s*(\d+)", joined0, re.I)
        if m: number = m.group(1)
        # fila del encabezado de columnas
        h = None
        for i, r in enumerate(rows):
            if header_like(r):
                h = i
                while h + 1 < len(rows) and header_like(rows[h + 1]): h += 1
                break
        if h is None:
            self.alert("error", where, "No se encontró la fila de títulos de columna; la unidad no se pudo importar.")
            return None
        hdr = [c for c in rows[h] if c["vmerge"] != "continue"]
        upper_groups = []
        # encabezado en dos filas: la fila siguiente completa los títulos (celdas combinadas verticalmente)
        if h + 1 < len(rows):
            nxt = rows[h + 1]
            cont = [c for c in nxt if c["vmerge"] == "continue"]
            news = [c for c in nxt if c["vmerge"] != "continue" and c["text"].strip()]
            if cont and news and all(len(c["text"]) < 90 and any(re.search(k, c["text"].upper()) for k in HEADER_KW) for c in news):
                merged = []
                for c in hdr:
                    below = [x for x in news if c["start"] <= x["start"] < c["start"] + c["span"]]
                    if below:
                        upper_groups.append((c, below))
                        merged.extend(below)
                    else:
                        merged.append(c)
                hdr = merged
                h = h + 1
        columns, by_start = [], {}
        for k, c in enumerate(hdr):
            key = f"c{k+1}"
            label = norm(c["text"].replace("\n", " "))
            columns.append({"key": key, "label": label, "category": category(label)})
            for g in range(c["start"], c["start"] + c["span"]): by_start[g] = key
        for up, below in upper_groups:
            for col in columns:
                if any(by_start.get(b["start"]) == col["key"] for b in below):
                    col["group"] = norm(up["text"])
        hdr_labels = {norm(c["text"].replace("\n", " ")).upper() for c in hdr}
        for up, _ in upper_groups: hdr_labels.add(norm(up["text"].replace("\n", " ")).upper())
        # fila de grupos de columnas (ej. ESTRUCTURA DEL ESTÁNDAR | PROGRESIÓN DE LOS APRENDIZAJES)
        if h >= 1:
            prev = rows[h - 1]
            texts = distinct_texts(prev)
            if 2 <= len(texts) <= len(hdr) and all(t and len(t) < 80 and t == t.upper() and ":" not in t for t in texts):
                for c in prev:
                    for col in columns:
                        cs = [x for x in hdr if by_start.get(x["start"]) == col["key"]][0]
                        if c["start"] <= cs["start"] < c["start"] + c["span"]:
                            col["group"] = norm(c["text"])
                pre_rows = rows[:h - 1]
            else:
                pre_rows = rows[:h]
        else:
            pre_rows = []
        for r in pre_rows:
            for c in r:
                if c["vmerge"] == "continue" or not c["text"].strip(): continue
                t = c["text"]
                if norm(t.replace("\n", " ")).upper() in hdr_labels: continue
                lab, val = split_label(t)
                U = lab.upper()
                if re.match(r"UNIDAD\s*N", U) or (not lab and re.match(r"UNIDAD\s*N", val, re.I)):
                    mm = re.match(r"UNIDAD\s*N\s*[°º]?\s*:?\s*(\d+)\.?\s*(.*)$", (val if not lab else t), re.I | re.S)
                    if mm:
                        number = mm.group(1)
                        if mm.group(2).strip() and not name: name = mm.group(2).strip()
                    continue
                if U.startswith("NOMBRE DE LA UNIDAD"):
                    name = val; continue
                if U.startswith("DOCENTE"):
                    header_fields.append({"label": lab, "value": val})
                    if val: self.teachers.append({"grado": grade, "docente": val})
                    continue
                header_fields.append({"label": lab, "value": val})
        # filas de datos
        out_rows, last_by_key = [], {}
        for ri, r in enumerate(rows[h + 1:]):
            cells, spans, colspans, has = {}, {}, {}, False
            for c in r:
                key = by_start.get(c["start"])
                if key is None:
                    if c["text"].strip():
                        self.alert("advertencia", where, f"Texto fuera de las columnas en la fila {ri+1}: «{c['text'][:60]}…»")
                    continue
                if c["vmerge"] == "continue":
                    src = last_by_key.get(key)
                    if src is not None:
                        src.setdefault("_span", {})[key] = src.get("_span", {}).get(key, 1) + 1
                    continue
                cells[key] = c["text"]
                if c["text"].strip(): has = True
                ncols = len({by_start.get(g) for g in range(c["start"], c["start"] + c["span"]) if by_start.get(g)})
                if ncols > 1: colspans[key] = ncols
            if not cells and not has:
                continue
            if not has and all(v == "" for v in cells.values()) and not any(k for k in cells):
                continue
            if colspans: cells["_colspan"] = colspans
            out_rows.append(cells)
            for k in list(cells.keys()):
                if not k.startswith("_"): last_by_key[k] = cells
        # quitar filas totalmente vacías
        clean = []
        for c in out_rows:
            if any(isinstance(v, str) and v.strip() for k, v in c.items() if not k.startswith("_")) or c.get("_span"):
                clean.append(c)
            # filas vacías sin contenido se omiten
        for i, c in enumerate(clean):
            for col in columns:
                if col["key"] not in c and not any(col["key"] in (x.get("_span") or {}) for x in clean[:i]):
                    pass
        if not name.strip():
            self.alert("advertencia", where, "La unidad no tiene nombre en el documento.")
        empty_cells = sum(1 for c in clean for col in columns if col["key"] in c and not c[col["key"]].strip())
        if empty_cells:
            self.alert("info", where, f"{empty_cells} celda(s) vacía(s) en la tabla (se conservan vacías).")
        return {"label": "Unidad", "number_text": number, "name": name, "purpose_label": "Propósito",
                "purpose": "", "header_fields": header_fields, "columns": columns, "rows": clean}

    # ---------- proyectos de preescolar (formato "PROYECTO / PROPÓSITO") ----------
    def parse_preschool(self, rows, where):
        name = number = purpose = ""
        header_fields, out = [], []
        section, subheaders = "", []
        prev_sig = None
        for r in rows:
            texts = distinct_texts(r)
            nonempty = [t for t in texts if t.strip()]
            sig = tuple(texts)
            if not nonempty: continue
            if sig == prev_sig:   # fila repetida por celdas combinadas
                continue
            prev_sig = sig
            if len(nonempty) == 1:
                t = nonempty[0]
                U = t.upper()
                if U.startswith("MALLA DE"):
                    header_fields.append({"label": "", "value": t}); continue
                m = re.match(r"PROYECTO\s*(?:No\.?|N°)?\s*:?\s*(\d+)\s*[:.]?\s*(.*)$", t, re.I | re.S)
                if m: number, name = m.group(1), m.group(2).strip(); continue
                if U.startswith("PROP"):
                    lab, val = split_label(t); purpose = val; continue
                if len(t) < 70 and t == U and ":" not in t:
                    section = t; subheaders = []; continue
                lab, val = split_label(t)
                if not lab:
                    m2 = re.match(r"^([A-ZÁÉÍÓÚÑ ]{4,40})\s+(.+)$", t, re.S)
                    if m2: lab, val = m2.group(1).strip(), m2.group(2).strip()
                out.append({"c1": lab or section, "c2": val})
                continue
            first = nonempty[0]
            rest = nonempty[1:]
            if first.upper() in ("HABILIDADES DEL DESARROLLO INFANTIL", "ENFOQUES", "ME APROXIMA AL DBA", "ME APROXIMO DBA") \
               or (len(first) < 50 and first == first.upper() and len(rest) >= 1 and section and first == section):
                section = first
                texts2 = rest
            else:
                texts2 = nonempty
            if all(len(t) < 90 and t == t.upper() for t in texts2):
                if len(texts2) == 1:
                    section = (section + " — " if section else "") + texts2[0]; subheaders = []
                else:
                    subheaders = texts2
                continue
            if subheaders and len(subheaders) == len(texts2):
                for sh, v in zip(subheaders, texts2):
                    out.append({"c1": (section + " — " if section else "") + sh, "c2": v})
            else:
                out.append({"c1": section, "c2": "\n\n".join(texts2)})
        if not purpose: self.alert("advertencia", where, "No se encontró el propósito del proyecto.")
        self.alert("info", where, "Preescolar tiene una estructura por dimensiones; se importó como «Elemento / Descripción». Revise que el orden sea correcto.")
        cols = [{"key": "c1", "label": "Elemento", "category": "componente"},
                {"key": "c2", "label": "Descripción", "category": "aprendizaje"}]
        return {"label": "Proyecto", "number_text": number, "name": name, "purpose_label": "Propósito",
                "purpose": purpose, "header_fields": header_fields, "columns": cols, "rows": out}

    def add_project(self, grade, period, proj, where):
        if grade is None:
            self.alert("error", where, "No se pudo identificar el grado de esta tabla; no se importó.")
            self.general.append({"type": "note", "text": f"[Tabla sin grado identificado: {where}]"})
            return
        if period is None or period not in (1, 2, 3):
            self.alert("error", where, f"No se pudo identificar el período (número leído: «{proj.get('number_text')}»).")
            return
        key = (grade, period)
        if key in self.projects:
            old = self.projects[key]
            same = json.dumps(old["rows"], ensure_ascii=False) == json.dumps(proj["rows"], ensure_ascii=False)
            self.alert("error", where, f"El grado {grade}, período {period} aparece dos veces en el documento"
                       + (" con el mismo contenido; se conservó la primera." if same else " con contenido distinto; se conservó la primera y la segunda quedó en información general para revisión."))
            if not same:
                self.general.append({"type": "table_dump", "title": f"Duplicado {grade} P{period} ({where})",
                                     "rows": [[r.get("c1",""), r.get("c2","")] for r in proj["rows"]]})
            return
        proj["grade"], proj["period"], proj["source"] = grade, period, where
        self.projects[key] = proj

    def expand(self, el):
        """Devuelve las tablas anidadas dentro de una tabla (antes) y luego la tabla."""
        out = []
        for tc in el.iter(qn("w:tc")):
            for child in tc.findall(qn("w:tbl")):
                # solo tablas cuyo ancestro tabla más cercano es 'el'
                anc = child.getparent()
                while anc is not None and anc.tag != qn("w:tbl"): anc = anc.getparent()
                if anc is el:
                    out.extend(self.expand(child))
        if out:
            self.alert("info", "Documento", "Se encontró una tabla dentro de otra tabla; se procesó por separado.")
        return out + [el]

    def run(self):
        body = self.doc.element.body
        els = []
        for el in body.iterchildren():
            if el.tag == qn("w:tbl"): els.extend(self.expand(el))
            else: els.append(el)
        grade = None
        ti = -1
        i = 0
        in_curriculum = False
        while i < len(els):
            el = els[i]
            tag = el.tag.split("}")[1]
            if tag == "p":
                t = norm("".join(x.text or "" for x in el.iter(qn("w:t"))))
                if t:
                    g = detect_grade(t)
                    if g: grade = g
                    self.general.append({"type": "p", "text": t})
                i += 1; continue
            if tag != "tbl":
                i += 1; continue
            ti += 1
            rows = table_rows(el)
            where = f"Tabla {ti+1}"
            first_txt = " ".join(" ".join(distinct_texts(r)) for r in rows[:3])
            # título de tabla puede traer el grado (preescolar)
            g2 = detect_grade(" ".join(distinct_texts(rows[0]))) if rows else None
            if re.search(r"PROYECTO\s*(No|N°)", first_txt, re.I) and re.search(r"PROP[OÓ]SITO", first_txt, re.I):
                gg = g2 or grade
                proj = self.parse_preschool(rows, where)
                per = detect_period(" ".join(distinct_texts(rows[0]))) or (int(proj["number_text"]) if proj["number_text"].isdigit() else None)
                # tablas de continuación (sin título) que siguen inmediatamente
                j = i + 1
                while j < len(els) and els[j].tag.split("}")[1] == "tbl":
                    nrows = table_rows(els[j])
                    ntxt = " ".join(" ".join(distinct_texts(r)) for r in nrows[:3])
                    if re.search(r"PROYECTO|UNIDAD|T[EÉ]CNICAS", ntxt, re.I): break
                    ti += 1
                    extra = self.parse_preschool(nrows, f"Tabla {ti+1}")
                    self.alerts.pop()  # aviso repetido de preescolar
                    if not extra["purpose"]: self.alerts.pop()
                    proj["rows"].extend(extra["rows"])
                    self.alert("info", where, f"Se unió la Tabla {ti+1}, que continúa este proyecto.")
                    j += 1
                if gg: grade = gg
                self.add_project(gg, per, proj, where)
                i = j; continue
            if re.search(r"UNIDAD\s*N", first_txt, re.I):
                # encabezado partido en dos tablas
                if len(rows) <= 2 and i + 1 < len(els) and els[i + 1].tag.split("}")[1] == "tbl":
                    rows = rows + table_rows(els[i + 1]); ti += 1
                    self.alert("info", where, f"El encabezado de la unidad estaba en una tabla separada; se unió con la Tabla {ti+1}.")
                    i += 1
                proj = self.parse_unit(rows, grade, where)
                if proj:
                    per = int(proj["number_text"]) if proj["number_text"].isdigit() else detect_period(first_txt)
                    for hf in proj["header_fields"]:
                        p2 = detect_period(hf["value"]) or detect_period(hf["label"])
                        if p2: per = p2
                    self.add_project(grade, per, proj, where)
                i += 1; continue
            # cualquier otra tabla: información general
            self.general.append({"type": "table", "title": where,
                                 "rows": [[c["text"] for c in r if c["vmerge"] != "continue"] for r in rows]})
            i += 1
        return self

    def coverage_check(self):
        """Comprueba que cada texto del documento (párrafo o celda) aparezca en lo importado."""
        def key(t): return re.sub(r"\s+", " ", t).strip()
        units = []
        body = self.doc.element.body
        for p in body.findall(qn("w:p")):
            t = key("".join(x.text or "" for x in p.iter(qn("w:t"))))
            if t: units.append(t)
        for tbl in body.iter(qn("w:tbl")):
            for r in table_rows(tbl):
                for c in r:
                    if c["vmerge"] != "continue":
                        t = key(c["text"])
                        if t: units.append(t)
        parts = []
        for p in self.projects.values():
            parts += [p["name"], p["purpose"], p["number_text"], p["label"], p["purpose_label"]]
            parts += [h["label"] + ": " + h["value"] for h in p["header_fields"]] + [h["value"] for h in p["header_fields"]]
            parts += [c["label"] for c in p["columns"]] + [c.get("group", "") for c in p["columns"]]
            parts += [v for r in p["rows"] for k, v in r.items() if isinstance(v, str)]
        for g in self.general:
            if g["type"] == "p": parts.append(g["text"])
            elif g["type"] in ("table", "table_dump"): parts += [x for r in g["rows"] for x in r]
        corpus = key(" \u0001 ".join(parts)).upper()
        missing = []
        for u in units:
            U = u.upper()
            if U in corpus: continue
            # textos con etiqueta separada (ej. "PROPÓSITO: ...") se buscan sin la etiqueta
            lab, val = split_label(u)
            if val and key(val).upper() in corpus: continue
            m2 = re.match(r"^([A-ZÁÉÍÓÚÑ ]{4,40})\s+(.+)$", u, re.S)
            if m2 and key(m2.group(2)).upper() in corpus: continue
            mm = re.match(r"(?:PROYECTO|UNIDAD)\s*(?:No\.?|N\s*[°º]?)?\s*:?\s*\d+\s*[:.]?\s*(.*)$", u, re.I | re.S)
            if mm and key(mm.group(1)).upper() in corpus: continue
            missing.append(u)
        words = lambda x: len(re.findall(r"\w+", x))
        return len(units), missing, sum(words(u) for u in units)

    def result(self):
        with open(self.path, "rb") as f: data = f.read()
        n_units, missing, doc_w = self.coverage_check()
        grades = sorted({k[0] for k in self.projects})
        expected = {}
        for (g, p) in self.projects: expected.setdefault(g, set()).add(p)
        for g, ps in expected.items():
            missing = sorted({1, 2, 3} - ps)
            if missing:
                self.alert("error", f"Grado {g}", f"Faltan los períodos {', '.join(map(str, missing))} en el documento.")
        n_imgs = len(self.doc.inline_shapes)
        if n_imgs:
            self.alert("info", "Documento", f"El documento tiene {n_imgs} imagen(es); se conservan en el archivo original, no en las tablas.")
        if missing:
            self.alert("error", "Documento", f"{len(missing)} de {n_units} textos del documento no aparecen en lo importado. Revise:")
            for u in missing[:30]:
                self.alert("error", "Texto no encontrado", u[:300])
        else:
            self.alert("info", "Documento", f"Verificación completa: los {n_units} textos del documento ({doc_w} palabras) aparecen en lo importado.")
        return {
            "importer_version": VERSION,
            "file_name": os.path.basename(self.path),
            "sha256": hashlib.sha256(data).hexdigest(),
            "size_bytes": len(data),
            "file_modified_at": datetime.datetime.fromtimestamp(os.path.getmtime(self.path), datetime.timezone.utc).isoformat(),
            "summary": {"grados": len(grades), "proyectos": len(self.projects),
                        "filas": sum(len(p["rows"]) for p in self.projects.values()),
                        "palabras_documento": doc_w, "textos_documento": n_units, "textos_no_encontrados": len(missing),
                        "docentes_mencionados": self.teachers},
            "alerts": self.alerts,
            "general_info": self.general,
            "projects": list(self.projects.values()),
        }

if __name__ == "__main__":
    res = Importer(sys.argv[1]).run().result()
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    print(json.dumps(res["summary"], ensure_ascii=False)[:600])
    for a in res["alerts"]: print(a["nivel"].upper(), a["ubicacion"], "-", a["mensaje"])
    for p in res["projects"]: print(p["grade"], p["period"], p["label"], p["number_text"], "|", p["name"][:60], "| filas:", len(p["rows"]), "| cols:", [c["label"][:20] for c in p["columns"]])
