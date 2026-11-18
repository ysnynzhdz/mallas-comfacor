"""
Revisión de ortografía y tildes del contenido importado (no cambia redacción).
Paso 1 (analizar): lista palabras desconocidas, propone correcciones de tildes.
Paso 2 (aplicar): aplica una tabla de correcciones aprobadas y registra cada cambio.
"""
import sys, json, re, glob, os, collections
from spylls.hunspell import Dictionary

ES = Dictionary.from_files("/home/claude/dic/es_CO")
EN = Dictionary.from_files("/home/claude/dic/en_US")
WORD = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñàèìòùâêîôûçÀÈÌÒÙÇ]+")
LIG = {"ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl"}
def unlig(t): return "".join(LIG.get(ch, ch) for ch in t)
ACC = {"a": "á", "e": "é", "i": "í", "o": "ó", "u": "ú", "A": "Á", "E": "É", "I": "Í", "O": "Ó", "U": "Ú"}

def strings(d):
    """Recorre todos los textos editables del JSON: (ruta, texto)."""
    for pi, p in enumerate(d["projects"]):
        yield ("projects", pi, "name"), p["name"]
        yield ("projects", pi, "purpose"), p["purpose"]
        for hi, h in enumerate(p["header_fields"]):
            yield ("projects", pi, "header_fields", hi, "label"), h["label"]
            yield ("projects", pi, "header_fields", hi, "value"), h["value"]
        for ci, c in enumerate(p["columns"]):
            yield ("projects", pi, "columns", ci, "label"), c["label"]
            if c.get("group"): yield ("projects", pi, "columns", ci, "group"), c["group"]
        for ri, r in enumerate(p["rows"]):
            for k, v in r.items():
                if isinstance(v, str): yield ("projects", pi, "rows", ri, k), v
    for gi, g in enumerate(d["general_info"]):
        if g["type"] in ("p", "note"): yield ("general_info", gi, "text"), g["text"]
        else:
            for ri, r in enumerate(g["rows"]):
                for ci, v in enumerate(r): yield ("general_info", gi, "rows", ri, ci), v

def known(w, english):
    if ES.lookup(w): return True
    if english and EN.lookup(w): return True
    return False

def accent_fix(w):
    """Única variante con una tilde (o ñ/ü) que sí existe en el diccionario."""
    out = set()
    for i, ch in enumerate(w):
        if ch in ACC:
            v = w[:i] + ACC[ch] + w[i + 1:]
            if ES.lookup(v): out.add(v)
        if ch in "nN":
            v = w[:i] + ("ñ" if ch == "n" else "Ñ") + w[i + 1:]
            if ES.lookup(v): out.add(v)
    return out

if __name__ == "__main__" and sys.argv[1] == "analizar":
    unknown = collections.Counter(); ctx = {}; area_of = collections.defaultdict(set)
    for f in sorted(glob.glob("/home/claude/import_out/[0-9]*.json")):
        d = json.load(open(f)); english = "Inglés" in f
        for path, text in strings(d):
            text = unlig(text or "")
            for m in WORD.finditer(text):
                w = m.group(0)
                if len(w) < 3 or (w.isupper() and len(w) <= 5): continue
                if known(w, english): continue
                unknown[w] += 1; area_of[w].add(os.path.basename(f).split(".")[0])
                if w not in ctx: ctx[w] = text[max(0, m.start() - 40): m.end() + 40].replace("\n", " ")
    acc, rest = {}, {}
    for w, n in unknown.items():
        a = accent_fix(w)
        if len(a) == 1: acc[w] = next(iter(a))
        else: rest[w] = n
    json.dump({"tildes": acc, "otras": {w: {"n": unknown[w], "ctx": ctx[w], "areas": sorted(area_of[w])} for w in rest}},
              open("/home/claude/ortografia/candidatas.json", "w"), ensure_ascii=False, indent=1)
    print("desconocidas:", len(unknown), "| tildes seguras:", len(acc), "| otras:", len(rest))

# ---------------------------------------------------------------- aplicar
URL = re.compile(r"(https?://\S+|www\.\S+|\S+@\S+\.\S+|\S+\.(?:pdf|php|html?)\S*)")

def build_maps():
    cfg = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "correcciones.json"), encoding="utf-8"))
    cand = json.load(open("/home/claude/ortografia/candidatas.json", encoding="utf-8"))
    words = {w: v for w, v in cand["tildes"].items() if w not in set(cfg["excluir_tildes"])}
    words.update(cfg["palabras"])
    return words, cfg["frases"]

def fix_segment(seg, words, english, log):
    # 3) palabras sueltas (tildes y errores de digitación)
    def one(m):
        w = m.group(0)
        if w in words and not (english and EN.lookup(w)):
            log.append((w, words[w])); return words[w]
        return w
    seg = WORD.sub(one, seg)
    # 1) palabras partidas por artefactos de PDF ("científi cas", "consecuenc ias")
    def join_pairs(m):
        a, b = m.group(1), m.group(2)
        if known(a + b, english) and (not known(a, english) or not known(b, english)) and not (a[0].isupper() and b[0].isupper() and len(a) > 3 and len(b) > 3):
            log.append((a + " " + b, a + b)); return a + b
        return m.group(0)
    seg = re.sub(r"\b([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,}) ([a-záéíóúüñ]{2,})\b", join_pairs, seg)
    # 2) palabras pegadas: "amorMi" → "amor Mi"
    def split_camel(m):
        a, b = m.group(1), m.group(2)
        if known(a, english) and known(b, english) and not known(a + b, english):
            log.append((a + b, a + " " + b)); return a + " " + b
        return m.group(0)
    seg = re.sub(r"\b([a-záéíóúüñ]{2,})([A-ZÁÉÍÓÚÑ][a-záéíóúüñ]+)\b", split_camel, seg)
    return seg

def fix_text(text, words, phrases, english, log):
    if not text: return text
    new = unlig(text)
    if new != text: log.append(("ligaduras tipográficas (ﬁ/ﬂ)", "fi/fl"))
    for a, b in phrases.items():
        if a in new:
            new = new.replace(a, b); log.append((a, b))
    parts = URL.split(new)
    out = [p if (k % 2 == 1) else fix_segment(p, words, english, log) for k, p in enumerate(parts)]
    return "".join(out)

def where(d, path):
    if path[0] == "projects":
        p = d["projects"][path[1]]
        campo = {"name": "nombre", "purpose": "propósito", "header_fields": "encabezado", "columns": "títulos de columna",
                 "rows": f"fila {path[3] + 1 if len(path) > 3 else ''}"}.get(path[2], path[2])
        return f"{p['grade']} · período {p['period']}{' · ' + p['subject'] if p.get('subject') else ''} · {campo}"
    return "Información general"

def set_path(d, path, value):
    obj = d
    for k in path[:-1]: obj = obj[k]
    obj[path[-1]] = value

if __name__ == "__main__" and sys.argv[1] == "aplicar":
    words, phrases = build_maps()
    os.makedirs("/home/claude/import_corr", exist_ok=True)
    total = 0
    for f in sorted(glob.glob("/home/claude/import_out/[0-9]*.json")):
        d = json.load(open(f, encoding="utf-8")); english = "Inglés" in f
        changes = collections.OrderedDict()
        for path, text in list(strings(d)):
            log = []
            new = fix_text(text, words, phrases, english, log)
            if new != text:
                set_path(d, path, new)
                for a, b in log:
                    c = changes.setdefault((a, b), {"antes": a, "despues": b, "veces": 0, "ubicaciones": []})
                    c["veces"] += 1
                    loc = where(d, path)
                    if loc not in c["ubicaciones"] and len(c["ubicaciones"]) < 6: c["ubicaciones"].append(loc)
        d.setdefault("summary", {})["correcciones_ortografia"] = sum(c["veces"] for c in changes.values())
        d["corrections"] = list(changes.values())
        name = os.path.basename(f)
        json.dump(d, open("/home/claude/import_corr/" + name, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        n = sum(c["veces"] for c in changes.values()); total += n
        print(f"{name[:-5]}: {n} correcciones ({len(changes)} distintas)")
    print("TOTAL", total)
