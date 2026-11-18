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

VERSION = "2.0.0"

# "UNIDAD N° 1", "UNIDAD NO. 2", "PROYECTO No. 3", "PROYECTO N° 1", "Unidad 1"
UNIT_RE = r"(UNIDAD|PROYECTO)\s*:?\s*(?:N\s*[°º.]|NO\.?|N[ÚU]MERO|N°|#|N)?\s*[:.]?\s*(\d+)"
# Título de unidad/proyecto sin número (ej. "PROYECTO No Sembrando Valores")
UNIT_NONUM_RE = r"^(UNIDAD|PROYECTO)\s*:?\s*(?:N\s*[°º.]|NO\.?|N°)\s*:?\s*([^\d\s].*)$"

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
    if re.search(r"AL TERMINAR|EST[AÁ]NDARES|CONTENIDOS POR GRADOS", t):
        return None
    if re.search(r"GRADO", t):
        t2 = t.split("GRADO", 1)[1]
    elif re.match(r"\s*MALLAS? DE APRENDIZAJES?", t) and len(t) < 90:
        t2 = t
    else:
        return None
    for slug, pats in GRADOS:
        for p in pats:
            if re.search(p, t2):
                return slug
    return None

SUBJECTS = [("Biología", r"BIOLOG[IÍ]A"), ("Química", r"QU[IÍ]MICA"), ("Física", r"F[IÍ]SICA")]

def detect_subject(text):
    t = text.upper()
    for name, pat in SUBJECTS:
        if re.search(pat, t): return name
    return None

def detect_period(text):
    t = text.upper()
    m = re.search(r"PER[IÍ]ODO\s*N[°º]?\s*:?\s*([123])\b", t)
    if m: return int(m.group(1))
    m = re.search(r"(?<!\d)(1|2|3|PRIMER|SEGUNDO|TERCER)\s*(ER|°|º)?\s*\.?\s*PER[IÍ]ODO", t)
    if not m:
        return None
    v = m.group(1)
    return {"1": 1, "PRIMER": 1, "2": 2, "SEGUNDO": 2, "3": 3, "TERCER": 3}[v]

T_TAG, BR_TAG, CR_TAG, TAB_TAG = qn("w:t"), qn("w:br"), qn("w:cr"), qn("w:tab")

def para_text(p):
    """Texto de un párrafo respetando saltos de línea (w:br) y tabulaciones dentro del párrafo."""
    out = []
    for e in p.iter():
        if e.tag == T_TAG: out.append(e.text or "")
        elif e.tag in (BR_TAG, CR_TAG): out.append("\n")
        elif e.tag == TAB_TAG: out.append(" ")
    return "".join(out)

def tc_text(tc):
    paras = []
    for p in tc.findall(qn("w:p")):   # solo párrafos propios; las tablas anidadas se procesan aparte
        paras.extend(para_text(p).split("\n"))
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

class VTable:
    """Parte de una tabla que contenía varias unidades (se procesa como tabla aparte)."""
    tag = qn("w:tbl")
    def __init__(self, rows): self.rows = rows

def table_rows(tbl):
    if isinstance(tbl, VTable): return tbl.rows
    return [grid_row(tr) for tr in tbl.findall(qn("w:tr"))]

def distinct_texts(row):
    return [c["text"] for c in row if c["vmerge"] != "continue"]

HEADER_KW = ["PREGUNTA PROBLEMA", "^TEMAS", "APRENDE A ", "ELEMENTOS CLAVE", "ENUNCIADO", "SUBPROCESO", "^FACTORES",
             "MANEJO CONOCIMIENTOS", "^RELACIONES", "ME APROXIMO AL CONOCIMIENTO", "DESARROLLO COMPROMISOS", "INDICADOR",
             "COMPETENCIA", "COMPONENTE", "APRENDIZAJE", "EVIDENCIA", "CONTENIDO", "INSTRUMENTO",
             "DERECHOS B", "DBA", "PENSAMIENTO", "PROCESOS", "DESEMPE", "EST[AÁ]NDAR", "CRITERIO", "AFIRMACI"]

def header_like(row):
    cells = [norm(c["text"]).upper() for c in row if c["text"].strip()]
    if len(cells) < 3: return False
    hits = sum(1 for c in cells if len(c) < 120 and any(re.search(k, c.lstrip("…. ")) for k in HEADER_KW))
    return hits >= 3 and hits * 2 >= len(cells)

def sub_header(row, above):
    """Fila que subdivide los títulos de la fila de arriba (celdas cortas bajo títulos combinados)."""
    cont = [c for c in row if c["vmerge"] == "continue"]
    news = [c for c in row if c["vmerge"] != "continue" and c["text"].strip()]
    if not news or not header_like_loose(above): return False
    if any(len(c["text"]) > 60 for c in news): return False
    wide = [c for c in above if c["span"] > 1]
    under_wide = all(any(w["start"] <= n["start"] < w["start"] + w["span"] for w in wide) for n in news)
    kw = all(any(re.search(k, n["text"].upper()) for k in HEADER_KW) for n in news)
    return bool(cont or under_wide) and (under_wide or kw)

def header_like_loose(row):
    cells = [norm(c["text"]).upper() for c in row if c["text"].strip()]
    return len(cells) >= 2 and all(len(c) < 120 for c in cells) and any(any(re.search(k, c.lstrip("…. ")) for k in HEADER_KW) for c in cells)

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
    m = re.match(r"^([A-ZÁÉÍÓÚÑ ()]{3,60})\n(.+)$", text.strip(), re.S)   # título en la primera línea
    if m: return m.group(1).strip(), m.group(2).strip()
    return "", text.strip()

def split_by_unit_column(proj):
    """Tablas donde cada fila dice a qué unidad pertenece (columna «Eje o Unidad»): una unidad por grupo de filas."""
    col = next((c for c in proj["columns"] if re.search(r"EJE O UNIDAD|^UNIDAD$", c["label"].upper())), None)
    if not col: return None
    rows = proj["rows"]
    keys = [c["key"] for c in proj["columns"]]
    # expandir celdas combinadas: cada fila conoce el texto efectivo de cada columna
    eff, origin = [], []
    cur = {}
    for i, r in enumerate(rows):
        e, o = {}, {}
        for k in keys:
            if k in r and isinstance(r.get(k), str):
                cur[k] = (r[k], i, int((r.get("_span") or {}).get(k, 1)))
            t, oi, sp = cur.get(k, ("", i, 1))
            if oi + sp - 1 >= i: e[k], o[k] = t, oi
            else: e[k], o[k] = "", i
        eff.append(e); origin.append(o)
    groups, current, num = [], None, None
    for i, r in enumerate(rows):
        val = eff[i][col["key"]]
        m = re.search(r"(\d+)", val)
        n = int(m.group(1)) if m else None
        if current is None or (n is not None and n != num and origin[i][col["key"]] == i):
            current = {"number": n, "label_text": val, "idx": []}
            groups.append(current); num = n
        current["idx"].append(i)
    if len(groups) < 2: return None
    out = []
    for g in groups:
        idx = g["idx"]; start, end = idx[0], idx[-1]
        new_rows = []
        for i in idx:
            r = {}
            for k in keys:
                oi = origin[i][k]
                if oi == i or i == start:
                    # celda propia, o primera fila del grupo cubierta desde arriba: se copia el texto
                    span = 1
                    j = i + 1
                    while j <= end and origin[j][k] == oi: span += 1; j += 1
                    r[k] = eff[i][k]
                    if span > 1: r.setdefault("_span", {})[k] = span
            if rows[i].get("_colspan"): r["_colspan"] = rows[i]["_colspan"]
            new_rows.append(r)
        out.append((g["number"], g["label_text"], new_rows))
    return out

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
    def parse_unit(self, rows, grade, where, label="Unidad"):
        joined0 = " ".join(distinct_texts(rows[0]))
        header_fields, number, name = [], "", ""
        purpose, purpose_label = "", "Propósito"
        name_from_title = False
        m = re.search(UNIT_RE, joined0, re.I)
        if m: number = m.group(2)
        # fila del encabezado de columnas
        h0 = None
        for i, r in enumerate(rows):
            if header_like(r):
                h0 = i
                break
        if h0 is None:
            self.alert("error", where, "No se encontró la fila de títulos de columna; la unidad no se pudo importar.")
            return None
        h = h0
        # encabezado en varias filas: bajar mientras la fila siguiente siga siendo de títulos
        def short_row(r):
            return all(len(c["text"]) < 70 for c in r if c["vmerge"] != "continue")
        while h + 1 < len(rows) and short_row(rows[h + 1]) and (header_like(rows[h + 1]) or sub_header(rows[h + 1], rows[h])):
            h += 1

        def origin_text(ri, start):
            for k in range(ri - 1, -1, -1):
                for c in rows[k]:
                    if c["start"] == start and c["vmerge"] != "continue":
                        return c["text"]
            return ""

        hdr = []
        for c in rows[h]:
            t = c["text"] if c["vmerge"] != "continue" else origin_text(h, c["start"])
            hdr.append({**c, "text": t})
        columns, by_start = [], {}
        for k, c in enumerate(hdr):
            key = f"c{k+1}"
            col_label = norm(c["text"].replace("\n", " "))
            columns.append({"key": key, "label": col_label, "category": category(col_label), "_start": c["start"], "_span": c["span"]})
            for g in range(c["start"], c["start"] + c["span"]): by_start[g] = key
        hdr_labels = set()
        for r in rows[h0:h + 1]:
            for c in r: hdr_labels.add(norm(c["text"].replace("\n", " ")).upper())
        # fila de grupos (ej. ESTRUCTURA DEL ESTÁNDAR | PROGRESIÓN DE LOS APRENDIZAJES), justo encima de los títulos
        group_row = None
        if h >= 1:
            up = rows[h - 1]
            covers = [c for c in up if c["vmerge"] != "continue" and c["text"].strip()]
            wide = [c for c in covers if sum(1 for col in columns if c["start"] <= col["_start"] < c["start"] + c["span"]) >= 2]
            labelish = any(re.search(UNIT_RE, c["text"], re.I) or re.match(r"\s*(NOM\w*E DE|DOCENTE|COMPETENCIAS?\s*:|COMPONENTES?\s*:|PROP[OÓ]SITO|OBJETIVO)", c["text"], re.I) for c in covers)
            if wide and not labelish and all(len(c["text"]) < 160 for c in covers):
                group_row = h - 1
                for c in wide:
                    for col in columns:
                        if c["start"] <= col["_start"] < c["start"] + c["span"] and norm(c["text"]).upper() != col["label"].upper():
                            col["group"] = norm(c["text"].replace("\n", " "))
                for c in up: hdr_labels.add(norm(c["text"].replace("\n", " ")).upper())
        for col in columns:
            col.pop("_start"); col.pop("_span")
        first_hdr = min(h0, group_row) if group_row is not None else h0
        pre_rows = rows[:first_hdr]
        marker_rows = set()
        for k in range(len(pre_rows) - 1):
            nxt = [c for c in pre_rows[k + 1] if c["vmerge"] != "continue" and c["text"].strip()]
            if nxt and all(c["text"].strip().upper() == "X" for c in nxt):
                labels = pre_rows[k]
                first = next((c for c in labels if c["text"].strip()), None)
                opts = []
                for l in labels:
                    if l is first or l["vmerge"] == "continue" or not l["text"].strip(): continue
                    is_marked = any(l["start"] <= c["start"] < l["start"] + l["span"] for c in nxt)
                    opts.append(norm(l["text"]) + (" (X)" if is_marked else ""))
                header_fields.append({"label": norm(first["text"]) if first else "", "value": "\n".join(opts)})
                marker_rows.update({k, k + 1})
        for k, r in enumerate(pre_rows):
            if k in marker_rows: continue
            for c in r:
                if c["vmerge"] == "continue" or not c["text"].strip(): continue
                t = c["text"]
                if norm(t.replace("\n", " ")).upper() in hdr_labels: continue
                lab, val = split_label(t)
                U = lab.upper()
                mm = re.match(UNIT_RE + r"\s*[.:\-–]?\s*(.*)$", t.strip(), re.I | re.S)
                if mm:
                    number = mm.group(2)
                    rest = mm.group(3).strip()
                    if rest and not name: name, name_from_title = rest, True
                    elif rest: header_fields.append({"label": "", "value": rest})
                    continue
                mn = re.match(UNIT_NONUM_RE, t.strip(), re.I | re.S)
                if mn:
                    if not name: name = mn.group(2).strip()
                    continue
                if re.match(r"NOM\w*E DE(L| LA)? (UNIDAD|PROYECTO)", U):
                    if name and name_from_title and val:
                        header_fields.append({"label": "", "value": name})   # ej. "Proyecto en construcción."
                    if val: name, name_from_title = val, False
                    continue
                if re.match(r"(OBJETIVO|PROP[OÓ]SITO)", U) and not purpose:
                    purpose_label, purpose = lab, val; continue
                if U.startswith("DOCENTE"):
                    header_fields.append({"label": lab, "value": val})
                    if val: self.teachers.append({"grado": grade, "docente": val})
                    continue
                header_fields.append({"label": lab, "value": val})
        # filas de datos
        out_rows, last_by_key = [], {}
        for ri, r in enumerate(rows[h + 1:]):
            cells, spans, colspans, has = {}, {}, {}, False
            own = {by_start.get(c["start"]) for c in r if c["vmerge"] != "continue"}
            for c in r:
                key = by_start.get(c["start"])
                if key is None:
                    if c["text"].strip():
                        self.alert("advertencia", where, f"Texto fuera de las columnas en la fila {ri+1}: «{c['text'][:60]}…»")
                    continue
                if c["vmerge"] == "continue":
                    src = last_by_key.get(key)
                    if src is not None and key not in own and key not in cells:
                        src.setdefault("_span", {})[key] = src.get("_span", {}).get(key, 1) + 1
                        cells["_cov"] = True
                    continue
                if key in cells and cells[key].strip() and c["text"].strip():
                    cells[key] = cells[key] + "\n" + c["text"]   # dos celdas bajo un mismo título: se unen
                    continue
                cells[key] = c["text"] if not cells.get(key) else cells[key]
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
            keep = any(isinstance(v, str) and v.strip() for k, v in c.items() if not k.startswith("_")) or c.get("_span") or c.get("_cov")
            c.pop("_cov", None)
            if keep: clean.append(c)
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
        return {"label": label, "number_text": number, "name": name, "purpose_label": purpose_label,
                "purpose": purpose, "header_fields": header_fields, "columns": columns, "rows": clean}

    # ---------- proyectos de preescolar (formato "PROYECTO / PROPÓSITO") ----------
    def parse_preschool(self, rows, where, label="Proyecto"):
        name = number = purpose = ""
        purpose_label = "Propósito"
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
                m = re.match(UNIT_RE + r"\s*[:.\-–]?\s*(.*)$", t, re.I | re.S)
                if m: number, name = m.group(2), m.group(3).strip(); continue
                mn = re.match(UNIT_NONUM_RE, t.strip(), re.I | re.S)
                if mn: name = mn.group(2).strip(); continue
                if re.match(r"NOM\w*E DE(L| LA)? (UNIDAD|PROYECTO)", U):
                    lab, val = split_label(t); name = val; continue
                if (U.startswith("PROP") or U.startswith("OBJETIVO")) and not purpose:
                    lab, val = split_label(t); purpose = val; purpose_label = lab or "Propósito"; continue
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
        self.alert("info", where, "Esta tabla no tiene columnas fijas (estructura por dimensiones o enfoques); se importó como «Elemento / Descripción». Revise que el orden sea correcto.")
        cols = [{"key": "c1", "label": "Elemento", "category": "componente"},
                {"key": "c2", "label": "Descripción", "category": "aprendizaje"}]
        return {"label": label, "number_text": number, "name": name, "purpose_label": purpose_label,
                "purpose": purpose, "header_fields": header_fields, "columns": cols, "rows": out}

    def add_project(self, grade, period, proj, where):
        if grade is None:
            self.alert("error", where, "No se pudo identificar el grado de esta tabla; no se importó.")
            self.general.append({"type": "note", "text": f"[Tabla sin grado identificado: {where}]"})
            return
        if period is None or period not in (1, 2, 3):
            subject = getattr(self, "subject", None)
            used = {k[1] for k in self.projects if k[0] == grade and k[2] == subject}
            free = [x for x in (1, 2, 3) if x not in used]
            if not free:
                self.alert("error", where, f"No se pudo ubicar en un período (número leído: «{proj.get('number_text')}»); quedó en información general para revisión.")
                self.dump_project(proj, f"Sin período {grade} ({where})")
                return
            period = free[0]
            self.alert("advertencia", where, f"El documento no indica el número de este {proj['label'].lower()}; se ubicó en el período {period} por su orden.")
        subject = getattr(self, "subject", None)
        key = (grade, period, subject)
        if key in self.projects:
            old = self.projects[key]
            same = json.dumps(old["rows"], ensure_ascii=False) == json.dumps(proj["rows"], ensure_ascii=False)
            # Decisión del administrador (2026-11-18): en estos casos la copia oficial es la SEGUNDA
            pref = {("9. Matemáticas.docx", "jardin", 3)}
            if not same and (os.path.basename(self.path), grade, period) in pref:
                self.alert("advertencia", where, f"El grado {grade}, período {period} aparece dos veces en el documento con contenido distinto; "
                           "por decisión del administrador se usa la segunda copia y la primera quedó en información general.")
                self.dump_project(old, f"Primera copia {grade} P{period} ({old.get('source', '')})")
                proj["grade"], proj["period"], proj["source"] = grade, period, where
                if subject: proj["subject"] = subject
                self.projects[key] = proj
                return
            self.alert("error", where, f"El grado {grade}{' (' + subject + ')' if subject else ''}, período {period} aparece dos veces en el documento"
                       + (" con el mismo contenido; se conservó la primera." if same else " con contenido distinto; se conservó la primera y la segunda quedó en información general para revisión."))
            if not same:
                self.dump_project(proj, f"Duplicado {grade} P{period} ({where})")
            return
        proj["grade"], proj["period"], proj["source"] = grade, period, where
        if subject: proj["subject"] = subject
        self.projects[key] = proj

    def dump_project(self, proj, title):
        """Guarda un proyecto completo en información general (para revisión), sin perder texto."""
        rows = [[f"{proj['label']} {proj['number_text']}: {proj['name']}".strip()]]
        if proj.get("purpose"): rows.append([f"{proj['purpose_label']}: {proj['purpose']}"])
        rows += [[f"{h['label']}: {h['value']}" if h["label"] else h["value"]] for h in proj["header_fields"]]
        rows.append([c["label"] for c in proj["columns"]])
        rows += [[r.get(c["key"], "") if isinstance(r.get(c["key"], ""), str) else "" for c in proj["columns"]] for r in proj["rows"]]
        self.general.append({"type": "table_dump", "title": title, "rows": rows})

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
        pending_subject = None
        self.subject = None
        self.pending_period = None
        last_par = ""
        last_proj = None
        ti = -1
        i = 0
        in_curriculum = False
        while i < len(els):
            el = els[i]
            tag = el.tag.split("}")[1]
            if tag == "p":
                t = "\n".join(norm(x) for x in para_text(el).split("\n")).strip()
                if t:
                    if re.match(r"^C\.?\s*ECON[OÓ]MICAS\.?$", t.upper()): pending_subject = "Ciencias Económicas"
                    elif re.match(r"^C\.?\s*POL[IÍ]TICAS\.?$", t.upper()): pending_subject = "Ciencias Políticas"
                    g = detect_grade(t)
                    pp = detect_period(t) or (int(re.search(r"PER[IÍ]ODO\s*N[°º]?\s*:?\s*(\d)", t.upper()).group(1))
                                             if re.search(r"PER[IÍ]ODO\s*N[°º]?\s*:?\s*(\d)", t.upper()) else None)
                    if g and pp: self.pending_period = pp
                    last_par = t
                    if g:
                        grade = g
                        self.subject = (detect_subject(t) if len(t) < 90 else None) or pending_subject
                        pending_subject = None
                    self.general.append({"type": "p", "text": t})
                i += 1; continue
            if tag != "tbl":
                i += 1; continue
            ti += 1
            rows = table_rows(el)
            pp_now, self.pending_period = self.pending_period, None   # el período del párrafo solo aplica a la tabla siguiente
            # una tabla con varias unidades adentro se divide en partes
            def is_title(r):
                cs = [c for c in r if c["vmerge"] != "continue" and c["text"].strip()]
                return bool(cs) and re.match(UNIT_RE, cs[0]["text"].strip(), re.I) is not None
            titles = [k for k, r in enumerate(rows) if is_title(r)]
            cuts = titles[1:]   # se corta solo a partir del segundo título de unidad
            if cuts:
                bounds = [0] + cuts + [len(rows)]
                parts = [rows[bounds[k]:bounds[k + 1]] for k in range(len(bounds) - 1)]
                rows = parts[0]
                for k, part in enumerate(parts[1:]):
                    els.insert(i + 1 + k, VTable(part))
                self.alert("info", f"Tabla {ti+1}", f"La tabla contenía {len(parts)} unidades; se separaron.")
            where = f"Tabla {ti+1}"
            first_txt = " ".join(" ".join(distinct_texts(r)) for r in rows[:3])
            # título de tabla puede traer el grado (preescolar)
            g2 = detect_grade(" ".join(distinct_texts(rows[0]))) if rows else None
            um = re.search(UNIT_RE, first_txt, re.I) or re.search(r"(UNIDAD|PROYECTO)\s*:?\s*(?:N\s*[°º.]|NO\.?|N°)", first_txt, re.I)
            if um:
                label = "Proyecto" if um.group(1).upper().startswith("PROY") else "Unidad"
                gg = g2 or grade
                if g2: grade = g2
                consumed = 0
                next_i = i + 1
                # el encabezado de la unidad puede estar en una tabla y sus columnas en la(s) siguiente(s)
                if not any(header_like(r) for r in rows):
                    j = i + 1
                    while j < len(els) and els[j].tag.split("}")[1] == "p" and not "".join(x.text or "" for x in els[j].iter(qn("w:t"))).strip():
                        j += 1
                    while j < len(els) and consumed < 2 and els[j].tag.split("}")[1] == "tbl":
                        nrows = table_rows(els[j])
                        ntxt = " ".join(" ".join(distinct_texts(r)) for r in nrows[:3])
                        if re.search(UNIT_RE, ntxt, re.I): break
                        if not any(header_like(r) for r in nrows): break
                        rows = rows + nrows; consumed += 1; j += 1; next_i = j
                        self.alert("info", where, f"El encabezado y las columnas estaban en tablas separadas; se unieron (Tabla {ti+1+consumed}).")
                        break
                alltxt = " ".join(" ".join(distinct_texts(r)) for r in rows).upper()
                saved_subject = self.subject
                if re.search(r"EST[AÁ]NDAR DE COMPETENCIAS CIUDADANAS", alltxt):
                    self.subject = "Competencias ciudadanas"
                block_mode = bool(
                    re.search(r"HABILIDADES DEL DESARROLLO|\bENFOQUES\b|DESARROLLO DE HABILIDADES EN LA DIMENSI", alltxt))
                if not block_mode and any(header_like(r) for r in rows):
                    proj = self.parse_unit(rows, gg, where, label)
                    ti += consumed
                    i = next_i
                    parts = split_by_unit_column(proj) if proj else None
                    if parts:
                        self.alert("info", where, f"La tabla contiene {len(parts)} unidades (columna «Eje o Unidad»); se separó una por período.")
                        for n, lt, prs in parts:
                            pj = {**proj, "rows": prs, "number_text": str(n or ""), "name": proj["name"]}
                            self.add_project(gg, n if n in (1, 2, 3) else None, pj, where)
                        proj = None
                    if proj:
                        per = int(proj["number_text"]) if proj["number_text"].isdigit() else detect_period(first_txt)
                        for hf in proj["header_fields"]:
                            p2 = detect_period(hf["value"]) or detect_period(hf["label"])
                            if p2: per = p2
                        p0 = detect_period(" ".join(distinct_texts(rows[0])))
                        if p0: per = p0
                        self.add_project(gg, per, proj, where)
                    self.subject = saved_subject
                    continue
                # sin columnas fijas: lectura por bloques (Elemento / Descripción)
                proj = self.parse_preschool(rows, where, label)
                per = detect_period(" ".join(distinct_texts(rows[0]))) or (int(proj["number_text"]) if proj["number_text"].isdigit() else None)
                j = i + 1
                while j < len(els) and els[j].tag.split("}")[1] == "tbl":
                    nrows = table_rows(els[j])
                    ntxt = " ".join(" ".join(distinct_texts(r)) for r in nrows[:3])
                    if re.search(UNIT_RE, ntxt, re.I) or re.search(r"T[EÉ]CNICAS", ntxt, re.I): break
                    if detect_grade(" ".join(distinct_texts(nrows[0]))): break
                    ti += 1
                    n_alerts = len(self.alerts)
                    extra = self.parse_preschool(nrows, f"Tabla {ti+1}", label)
                    del self.alerts[n_alerts:]
                    proj["rows"].extend(extra["rows"])
                    self.alert("info", where, f"Se unió la Tabla {ti+1}, que continúa este {label.lower()}.")
                    j += 1
                self.add_project(gg, per, proj, where)
                self.subject = saved_subject
                i = j; continue
            # tablas de un período sin título de unidad (ej. "GRADO 10° PERÍODO N°1" seguido de las tablas)
            if pp_now and any(header_like(r) for r in rows):
                n_alerts = len(self.alerts)
                proj = self.parse_unit(rows, grade, where, "Unidad")
                j = i + 1
                while proj:
                    k = j
                    while k < len(els) and els[k].tag.split("}")[1] == "p" and not para_text(els[k]).strip(): k += 1
                    if k >= len(els) or els[k].tag.split("}")[1] != "tbl": break
                    nrows = table_rows(els[k])
                    ntxt = " ".join(" ".join(distinct_texts(r)) for r in nrows[:3])
                    if re.search(UNIT_RE, ntxt, re.I) or not any(header_like(r) for r in nrows): break
                    extra = self.parse_unit(nrows, grade, f"Tabla {ti+2}", "Unidad")
                    if not extra: break
                    ti += 1; j = k + 1
                    for r in extra["rows"]:
                        proj["rows"].append({(proj["columns"][int(key[1:]) - 1]["key"] if key.startswith("c") and int(key[1:]) <= len(proj["columns"]) else key): v
                                             for key, v in r.items()})
                    for c_old, c_new in zip(proj["columns"], extra["columns"]):
                        if c_new["label"] and c_new["label"].upper() != c_old["label"].upper():
                            proj["header_fields"].append({"label": f"Título de columna en la segunda tabla ({c_old['label']})", "value": c_new["label"]})
                    self.alert("info", where, f"Se unió la Tabla {ti+1}, que continúa este período.")
                if proj:
                    del self.alerts[n_alerts:]
                    self.add_project(grade, pp_now, proj, where)
                    last_proj = proj
                i = j; continue
            if last_proj is not None and re.match(r"TIPOS DE TEXTOS", last_par.upper()):
                last_proj["header_fields"].append({"label": last_par.rstrip("."), "value": "\n".join(
                    " | ".join(c["text"] for c in r if c["vmerge"] != "continue") for r in rows)})
                last_par = ""
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
            t = key(para_text(p))
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
            if re.match(r"^[^:]{1,70}:\s*$", u) or u.strip().upper() == "X": continue   # etiquetas vacías y marcas
            U = u.upper()
            if U in corpus: continue
            # textos con etiqueta separada (ej. "PROPÓSITO: ...") se buscan sin la etiqueta
            lab, val = split_label(u)
            if val and key(val).upper() in corpus: continue
            m2 = re.match(r"^([A-ZÁÉÍÓÚÑ ]{4,90})\s+(.+)$", u, re.S)
            if m2 and (key(m2.group(2)).upper() in corpus or any(key(m2.group(2)).upper().endswith(x) for x in [""]) and key(m2.group(2)).upper() in corpus): continue
            if any(key(u).upper().replace(" ", "") == key(x).upper().replace(" ", "") for x in []): continue
            if key(u).upper().replace(" ", "") in corpus.replace(" ", ""): continue
            mm = re.match(UNIT_RE + r"\s*[.:\-–]?\s*(.*)$", u, re.I | re.S)
            if mm and (not mm.group(3).strip() or key(mm.group(3)).upper() in corpus): continue
            mn = re.match(UNIT_NONUM_RE, u, re.I | re.S)
            if mn and key(mn.group(2)).upper() in corpus: continue
            missing.append(u)
        words = lambda x: len(re.findall(r"\w+", x))
        return len(units), missing, sum(words(u) for u in units)

    def result(self):
        with open(self.path, "rb") as f: data = f.read()
        n_units, missing, doc_w = self.coverage_check()
        grades = sorted({k[0] for k in self.projects})
        expected = {}
        for (g, p, sub) in self.projects: expected.setdefault((g, sub), set()).add(p)
        for (g, sub), ps in expected.items():
            missing_p = sorted({1, 2, 3} - ps)
            if missing_p:
                self.alert("error", f"Grado {g}" + (f" ({sub})" if sub else ""), f"Faltan los períodos {', '.join(map(str, missing_p))} en el documento.")
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
    for p in res["projects"]: print(p["grade"], p["period"], p.get("subject",""), p["label"], p["number_text"], "|", p["name"][:60], "| filas:", len(p["rows"]), "| cols:", [c["label"][:20] for c in p["columns"]])
