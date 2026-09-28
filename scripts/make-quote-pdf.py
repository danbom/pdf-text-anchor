"""Regenerate public/doc-v1.pdf and public/doc-v2.pdf.

doc-v1.pdf  page 1: plain page. page 2: same content, /Rotate 90.
doc-v2.pdf  page 1: same content with one sentence inserted under the title.

Body text uses real ligature code points (U+FB00 ff, U+FB01 fi, U+FB03 ffi)
so that pdf.js text normalization has something to change.
"""
import sys
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

pdfmetrics.registerFont(TTFont("Body", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))

TITLE = "Protocol Amendment 3: Visit Schedule"
BODY = [
    "Participants attend the ﬁrst visit within 14 days of screening.",
    "Site staﬀ record vital signs before any study procedure begins.",
    "Adverse events are reported to the sponsor within 24 hours of",
    "the site becoming aware of them. The investigator conﬁrms each",
    "report and signs the oﬃcial form before it is ﬁled.",
    "Dose changes follow the table in Section 6.2 of this protocol.",
]
INSERTED = "This amendment supersedes version 2.0 dated 1 March 2026."


def page(c, lines, rotate=0):
    if rotate:
        # reportlab swaps the MediaBox for /Rotate 90, so hand it the swapped
        # size to keep the MediaBox portrait (612 x 792) like page 1.
        c.setPageSize((792, 612))
        c.setPageRotation(rotate)
    else:
        c.setPageSize((612, 792))
    c.setFont("Bold", 16)
    c.drawString(72, 720, TITLE)
    c.setFont("Body", 12)
    y = 690
    for line in lines:
        c.drawString(72, y, line)
        y -= 18
    c.showPage()


out = sys.argv[1] if len(sys.argv) > 1 else "public"
c = canvas.Canvas(f"{out}/doc-v1.pdf", pagesize=(612, 792), invariant=1, initialFontName="Body")
page(c, BODY)
page(c, BODY, rotate=90)
c.save()

c = canvas.Canvas(f"{out}/doc-v2.pdf", pagesize=(612, 792), invariant=1, initialFontName="Body")
page(c, [INSERTED] + BODY)
c.save()
print("ok")
