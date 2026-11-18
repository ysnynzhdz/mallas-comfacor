"""Correcciones de estructura sobre los JSON ya corregidos de ortografía (import_corr).
- Limpia el nombre de la unidad: quita ': ' o '- ' iniciales y el prefijo 'UNIDAD N° x:'.
- Coloca nombres propuestos (nombres_propuestos.json) solo donde el documento no trae nombre.
Todo cambio queda registrado en d['estructura'] para mostrarlo en la plataforma."""
import json, re, glob, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/import_corr"
prop = json.load(open(os.path.join(HERE, "nombres_propuestos.json")))
GR = {"prejardin":"Prejardín","jardin":"Jardín","transicion":"Transición","primero":"1°","segundo":"2°","tercero":"3°","cuarto":"4°","quinto":"5°","sexto":"6°","septimo":"7°","octavo":"8°","noveno":"9°","decimo":"10°","undecimo":"11°"}
for f in sorted(glob.glob(os.path.join(SRC, "*.json"))):
    area = os.path.basename(f)[:-5]; d = json.load(open(f)); log = []
    names = prop.get(area, {})
    for p in d["projects"]:
        where = f"{GR.get(p['grade'], p['grade'])} · período {p['period']}" + (f" · {p['subject']}" if p.get("subject") else "")
        n0 = p.get("name") or ""; n = n0.strip()
        n = re.sub(r"^(UNIDAD|PROYECTO)\s*N?\s*[°º.]?\s*\d+\s*[:.\-–]\s*", "", n, flags=re.I)
        n = re.sub(r"^[:\-–]\s*", "", n).strip()
        if n != n0.strip():
            log.append({"tipo": "limpieza_nombre", "ubicacion": where, "antes": n0.strip(), "despues": n})
        p["name"] = n; p["name_is_proposed"] = False
        k = f"{p['grade']}|{p['period']}"
        if not n and k in names:
            p["name"] = names[k]; p["name_is_proposed"] = True
            log.append({"tipo": "nombre_propuesto", "ubicacion": where, "antes": "", "despues": names[k]})
        elif not n:
            log.append({"tipo": "sin_nombre", "ubicacion": where, "antes": "", "despues": ""})
    d["estructura"] = log
    d["summary"]["correcciones_estructura"] = len(log)
    json.dump(d, open(f, "w"), ensure_ascii=False)
    print(area, len(log), [x for x in log if x["tipo"] == "sin_nombre"])
