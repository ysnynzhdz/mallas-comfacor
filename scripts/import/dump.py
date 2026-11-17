import sys, re
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph
doc = Document(sys.argv[1])
body = doc.element.body
ti = 0
for el in body.iterchildren():
    tag = el.tag.split('}')[1]
    if tag == 'p':
        t = Paragraph(el, doc).text.strip()
        if t: print('P|', t[:110])
    elif tag == 'tbl':
        t = Table(el, doc)
        print(f'T{ti}| rows={len(t.rows)} cols={len(t.columns)}')
        for r in t.rows[:4]:
            seen=[]; 
            for c in r.cells:
                x=re.sub(r'\s+',' ',c.text.strip())[:45]
                if not seen or seen[-1]!=x: seen.append(x)
            print('    ', ' | '.join(seen))
        ti += 1
