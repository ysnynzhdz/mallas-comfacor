"""Muestra la estructura de una tabla de un .docx (filas, celdas reales, combinaciones)."""
import sys, re, importlib.util
spec = importlib.util.spec_from_file_location("imp", sys.argv[0].replace("inspeccionar.py", "importar_docx.py"))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
imp = m.Importer(sys.argv[1])
body = imp.doc.element.body
els = []
for el in body.iterchildren():
    if el.tag == m.qn("w:tbl"): els.extend(imp.expand(el))
    else: els.append(el)
tbls = [e for e in els if e.tag == m.qn("w:tbl")]
want = [int(x) for x in sys.argv[2].split(",")]
maxr = int(sys.argv[3]) if len(sys.argv) > 3 else 12
for n in want:
    rows = m.table_rows(tbls[n-1])
    print(f"--- Tabla {n}: {len(rows)} filas")
    for i, r in enumerate(rows[:maxr]):
        print(i, " || ".join(f"[{c['start']}+{c['span']}{'v' if c['vmerge']=='continue' else ''}]" + re.sub(r'\s+',' ',c['text'])[:45] for c in r))
